import { defineBehavior, numberOf, type ResolvedValues } from "@physisim/core";

/** 고장 속성이 없는 예전 LED Model도 돌아가도록 기본값을 둔다 (절대 최대 30 mA, 200 ms). */
const optional = (props: ResolvedValues, key: string, fallback: number) =>
  typeof props[key] === "number" ? numberOf(props, key) : fallback;

interface LedState {
  /** 절대 최대 전류를 넘긴 채로 지속된 시간 [s]. */
  readonly overload: number;
  /** 소손: 한 번 타면 회로에서 끊어진다 (되돌릴 수 없다). */
  readonly burnt: boolean;
}

/**
 * LED = 구간 선형 다이오드(A → C). 밝기 = 순방향 전류 / 정격 전류 (0~1).
 * 고장(P6-T4): 절대 최대 전류를 `burnTime` 넘게 지속하면 소손되어 회로에서 끊어지고(개방) 밝기 0이 된다.
 * 열 모델은 단순화한 시간 임계값이다 — 값은 Model `metadata.assumptions` 참조.
 */
export const led = defineBehavior<LedState>({
  id: "behavior.led",
  init: () => ({ overload: 0, burnt: false }),
  circuit: (s, ctx) =>
    s.burnt
      ? []
      : [
          {
            kind: "diode",
            id: "diode",
            anode: "A",
            cathode: "C",
            forwardVoltage: numberOf(ctx.properties, "forwardVoltage"),
            onResistance: numberOf(ctx.properties, "dynamicResistance"),
          },
        ],
  step: (state, _inputs, ctx) => {
    const current = state.burnt ? 0 : (ctx.circuit?.current("diode") ?? 0);
    const over = current > optional(ctx.properties, "absoluteMaxCurrent", 0.03);
    const overload = over ? state.overload + ctx.dt : 0;
    const burnt = state.burnt || overload >= optional(ctx.properties, "burnTime", 0.2);
    const brightness = burnt
      ? 0
      : Math.min(1, Math.max(0, current / numberOf(ctx.properties, "maxCurrent")));
    return { state: { overload, burnt }, outputs: { brightness, burnt } };
  },
});
