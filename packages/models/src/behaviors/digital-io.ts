import { defineBehavior, numberOf, type ResolvedValues } from "@physisim/core";

export type PinMode = "input" | "output";
export interface PinState {
  /** 핀 번호 (프로그램이 쓰는 번호). */
  readonly pin: number;
  readonly mode: PinMode;
  readonly level: boolean;
  /** 입력 핀의 내부 풀업. 켜져 있으면 회로에서 logicLevel로 당겨진다. */
  readonly pullup?: boolean;
}
export interface DigitalIoState {
  /** Port 이름 → 핀 상태. pinMode로 설정된 핀만 있다. */
  readonly pins: Readonly<Record<string, PinState>>;
}

/** 이벤트: `{ type: "pinMode", payload: { pin, mode } }`, `{ type: "digitalWrite", payload: { pin, level } }`. */
export type DigitalIoEvent =
  | {
      readonly type: "pinMode";
      readonly payload: { readonly pin: number; readonly mode: PinMode; readonly pullup?: boolean };
    }
  | {
      readonly type: "digitalWrite";
      readonly payload: { readonly pin: number; readonly level: boolean };
    };

/** 핀 번호 → Port 이름. 범위를 벗어나면 RangeError. */
export function pinPort(config: ResolvedValues, pin: number): string {
  const count = numberOf(config, "pinCount");
  if (!Number.isInteger(pin) || pin < 0 || pin >= count) {
    throw new RangeError(`없는 핀: ${pin} (0~${count - 1})`);
  }
  return `${String(config.pinPrefix)}${pin}`;
}

const outputsOf = (s: DigitalIoState) =>
  Object.fromEntries(Object.entries(s.pins).map(([port, p]) => [port, p.level]));

/**
 * GPIO 핀 묶음.
 * - 출력 핀: logicLevel 또는 0V를 내부 저항을 거쳐 구동한다.
 * - 입력 핀: 회로 전압이 logicLevel의 절반을 넘으면 HIGH로 읽는다.
 */
export const digitalIo = defineBehavior<DigitalIoState>({
  id: "behavior.digital-io",
  init: () => ({ pins: {} }),
  onEvent: (s, event, ctx) => {
    const e = event as DigitalIoEvent;
    const port = pinPort(ctx.config, e.payload.pin);
    const prev: PinState = s.pins[port] ?? { pin: e.payload.pin, mode: "input", level: false };
    const next: PinState =
      e.type === "pinMode"
        ? { ...prev, mode: e.payload.mode, pullup: e.payload.pullup === true }
        : { ...prev, level: e.payload.level };
    const state = { pins: { ...s.pins, [port]: next } };
    return { state, outputs: outputsOf(state) };
  },
  circuit: (s, ctx) =>
    Object.entries(s.pins).flatMap(([port, p]) => {
      if (p.mode === "output") {
        return [
          {
            kind: "drive" as const,
            id: port,
            port,
            voltage: p.level ? numberOf(ctx.config, "logicLevel") : 0,
            resistance: numberOf(ctx.config, "outputResistance"),
          },
        ];
      }
      // 입력 + 풀업: 약한 저항으로 logicLevel에 당긴다. 아무것도 안 달려 있으면 HIGH, 스위치가 GND에 이으면 LOW.
      return p.pullup
        ? [
            {
              kind: "drive" as const,
              id: `${port}.pullup`,
              port,
              voltage: numberOf(ctx.config, "logicLevel"),
              resistance: numberOf(ctx.config, "pullupResistance"),
            },
          ]
        : [];
    }),
  step: (s, _inputs, ctx) => {
    const threshold = numberOf(ctx.config, "logicLevel") / 2;
    const pins = Object.fromEntries(
      Object.entries(s.pins).map(([port, p]) => [
        port,
        p.mode === "input" ? { ...p, level: (ctx.circuit?.voltage(port) ?? 0) > threshold } : p,
      ]),
    );
    const state = { pins };
    return { state, outputs: outputsOf(state) };
  },
});
