import { defineBehavior, numberOf } from "@physisim/core";

/** 단자 1–2 사이의 이상 저항. 흐르는 전류(1 → 2)를 출력한다. */
export const resistor = defineBehavior<Record<string, never>>({
  id: "behavior.resistor",
  init: () => ({}),
  circuit: (_s, ctx) => [
    {
      kind: "resistor",
      id: "r",
      a: "1",
      b: "2",
      resistance: numberOf(ctx.properties, "resistance"),
    },
  ],
  step: (state, _inputs, ctx) => ({ state, outputs: { current: ctx.circuit?.current("r") ?? 0 } }),
});
