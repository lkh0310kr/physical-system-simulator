import { defineBehavior, numberOf, type ResolvedValues } from "@physisim/core";

type Phase = "sleep" | "boot" | "capture" | "connect" | "transmit";

export interface CameraNodeState {
  readonly phase: Phase;
  /** 현재 상태에 들어온 시각 [s]. */
  readonly since: number;
  /** 버튼을 누른 채로 있는지 (누르고 있어도 한 번만 촬영한다). */
  readonly held: boolean;
  readonly wakes: number;
  readonly sent: number;
}

const NEXT: Record<Exclude<Phase, "sleep">, Phase> = {
  boot: "capture",
  capture: "connect",
  connect: "transmit",
  transmit: "sleep",
};

/** 상태별 지속 시간 [s]. 전송 시간은 이미지 크기 / 속도. 절전은 버튼이 깨울 때까지 무한. */
function duration(phase: Phase, p: ResolvedValues): number {
  switch (phase) {
    case "boot":
      return numberOf(p, "bootTime");
    case "capture":
      return numberOf(p, "captureTime");
    case "connect":
      return numberOf(p, "connectTime");
    case "transmit":
      return numberOf(p, "imageBytes") / numberOf(p, "throughput");
    case "sleep":
      return Number.POSITIVE_INFINITY;
  }
}

/** 장치 내부(레귤레이터 출력 쪽)에서 쓰는 전류 [A]. */
function loadCurrent(phase: Phase, p: ResolvedValues): number {
  switch (phase) {
    case "boot":
      return numberOf(p, "bootCurrent");
    case "capture":
      return numberOf(p, "captureCurrent");
    case "connect":
      return numberOf(p, "connectCurrent");
    case "transmit":
      return numberOf(p, "transmitCurrent");
    case "sleep":
      return numberOf(p, "sleepCurrent");
  }
}

/** 배터리에서 끌어가는 전류: 레귤레이터 출력 전력을 배터리 전압과 효율로 환산한다. */
function batteryCurrent(phase: Phase, p: ResolvedValues): number {
  const ratio =
    numberOf(p, "supplyVoltage") /
    (numberOf(p, "batteryNominal") * numberOf(p, "regulatorEfficiency"));
  return loadCurrent(phase, p) * ratio;
}

/**
 * 절전 → (버튼) → 부팅 → 촬영 → 연결 → 전송 → 절전. 실제 펌웨어가 아니라 동작 모델이다 (스펙 v0.12).
 * 버튼은 WAKE 핀의 회로 전압으로 읽는다 (내부 풀업 100 kΩ, 버튼이 GND로 당기면 눌림).
 */
export const cameraNode = defineBehavior<CameraNodeState>({
  id: "behavior.camera-node",
  init: () => ({ phase: "sleep", since: 0, held: false, wakes: 0, sent: 0 }),
  circuit: (s, ctx) => [
    { kind: "load", id: "load", port: "VCC", current: batteryCurrent(s.phase, ctx.properties) },
    { kind: "drive", id: "wake-pullup", port: "WAKE", voltage: 3.3, resistance: 100_000 },
  ],
  step: (s, _inputs, ctx) => {
    const pressed =
      (ctx.circuit?.voltage("WAKE") ?? 3.3) < numberOf(ctx.properties, "wakeThreshold");
    let next: CameraNodeState = { ...s, held: pressed };
    if (s.phase === "sleep") {
      if (pressed && !s.held)
        next = { ...next, phase: "boot", since: ctx.time, wakes: s.wakes + 1 };
    } else if (ctx.time - s.since >= duration(s.phase, ctx.properties)) {
      const phase = NEXT[s.phase];
      next = { ...next, phase, since: ctx.time, sent: phase === "sleep" ? s.sent + 1 : s.sent };
    }
    return {
      state: next,
      outputs: {
        phase: next.phase,
        current: batteryCurrent(next.phase, ctx.properties),
        wakes: next.wakes,
        sent: next.sent,
        sentBytes: next.sent * numberOf(ctx.properties, "imageBytes"),
      },
    };
  },
});
