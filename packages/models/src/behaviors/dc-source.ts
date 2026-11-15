import { defineBehavior, numberOf } from "@physisim/core";

/** 이상 전압원 + 작은 내부 저항. 전류가 `maxCurrent`를 넘으면 전압이 그만큼 더 처진다고 보지 않고, 넘은 사실만 `overload`로 알린다. */
export const dcSource = defineBehavior<Record<string, never>>({
  id: "behavior.dc-source",
  init: () => ({}),
  circuit: (_s, ctx) => [
    {
      kind: "drive",
      id: "out",
      port: "+",
      voltage: numberOf(ctx.properties, "voltage"),
      resistance: numberOf(ctx.properties, "internalResistance"),
    },
  ],
  step: (state, _inputs, ctx) => ({
    state,
    outputs: { current: ctx.circuit?.current("out") ?? 0 },
  }),
});
