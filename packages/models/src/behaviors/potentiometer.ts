import { defineBehavior, numberOf } from "@physisim/core";

/**
 * 가변저항 = 단자 1–와이퍼(2), 와이퍼(2)–단자 3 두 저항.
 * position 0이면 와이퍼가 단자 1에 붙는다 (저항 최소값 MIN을 두어 0Ω 저항으로 회로가 특이해지지 않게 한다).
 */
const MIN_RESISTANCE = 0.01;

export const potentiometer = defineBehavior<Record<string, never>>({
  id: "behavior.potentiometer",
  init: () => ({}),
  circuit: (_s, ctx) => {
    const total = numberOf(ctx.properties, "resistance");
    const position = Math.min(1, Math.max(0, numberOf(ctx.properties, "position")));
    return [
      {
        kind: "resistor",
        id: "upper",
        a: "1",
        b: "2",
        resistance: Math.max(MIN_RESISTANCE, total * position),
      },
      {
        kind: "resistor",
        id: "lower",
        a: "2",
        b: "3",
        resistance: Math.max(MIN_RESISTANCE, total * (1 - position)),
      },
    ];
  },
  step: (s, _inputs, ctx) => ({
    state: s,
    outputs: { position: numberOf(ctx.properties, "position") },
  }),
});
