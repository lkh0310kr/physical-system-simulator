import { defineBehavior, numberOf } from "@physisim/core";

interface BridgeState {
  /** 직전 스텝에 읽은 전원 전압 (구동 전압으로 쓴다 — 회로 요소를 만들 때는 이번 해석 결과를 아직 모른다). */
  readonly vm: number;
  readonly supplyCurrent: number;
  readonly duty: number;
}

/**
 * H-브리지 모터 드라이버: `cmd`(−1~1)의 크기를 PWM 듀티로, 부호를 방향으로 쓴다.
 * 양수면 A에 VM을 듀티만큼 걸고 B는 접지, 음수면 반대. 0이면 둘 다 접지(제동).
 * 구동 단자의 평균 전류를 VM에서 끌어가도록 부하로 반영한다 (한 스텝 지연).
 */
export const hBridge = defineBehavior<BridgeState>({
  id: "behavior.h-bridge",
  init: () => ({ vm: 0, supplyCurrent: 0, duty: 0 }),
  circuit: (s, ctx) => {
    const r = numberOf(ctx.properties, "onResistance");
    return [
      {
        kind: "drive",
        id: "a",
        port: "A",
        voltage: s.vm,
        resistance: r,
        duty: Math.max(0, s.duty),
      },
      {
        kind: "drive",
        id: "b",
        port: "B",
        voltage: s.vm,
        resistance: r,
        duty: Math.max(0, -s.duty),
      },
      { kind: "load", id: "supply", port: "VM", current: s.supplyCurrent },
    ];
  },
  step: (s, inputs, ctx) => {
    const duty = Math.min(1, Math.max(-1, Number(inputs.cmd ?? 0)));
    const vm = ctx.circuit?.voltage("VM") ?? 0;
    // 두 구동 요소가 내보내는 전류의 합이 전원에서 나온다 (정류: 단자로 나가는 전류만)
    const supplyCurrent =
      Math.max(0, ctx.circuit?.current("a") ?? 0) + Math.max(0, ctx.circuit?.current("b") ?? 0);
    return { state: { vm, supplyCurrent, duty }, outputs: { duty, supplyCurrent } };
  },
});
