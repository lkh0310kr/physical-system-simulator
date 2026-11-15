import { defineBehavior, numberOf } from "@physisim/core";

/**
 * LED = 구간 선형 다이오드(A → C). 밝기 = 순방향 전류 / 최대 전류 (0~1).
 * 과전류 소손은 Phase 6에서 다룬다.
 */
export const led = defineBehavior<Record<string, never>>({
  id: "behavior.led",
  init: () => ({}),
  circuit: (_s, ctx) => [
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
    const current = ctx.circuit?.current("diode") ?? 0;
    const brightness = Math.min(1, Math.max(0, current / numberOf(ctx.properties, "maxCurrent")));
    return { state, outputs: { brightness } };
  },
});
