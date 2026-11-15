import { defineBehavior, numberOf } from "@physisim/core";

/**
 * DC 전압계: V–COM 사이에 입력 저항을 달고, 두 단자의 전압차를 읽는다.
 * 입력 저항이 유한하므로 높은 저항 회로를 재면 실제 계기처럼 값이 약간 처진다(부하 효과).
 */
export const voltmeter = defineBehavior<Record<string, never>>({
  id: "behavior.voltmeter",
  init: () => ({}),
  circuit: (_s, ctx) => [
    {
      kind: "resistor",
      id: "input",
      a: "V",
      b: "COM",
      resistance: numberOf(ctx.properties, "inputResistance"),
    },
  ],
  step: (state, _inputs, ctx) => ({
    state,
    outputs: { reading: (ctx.circuit?.voltage("V") ?? 0) - (ctx.circuit?.voltage("COM") ?? 0) },
  }),
});
