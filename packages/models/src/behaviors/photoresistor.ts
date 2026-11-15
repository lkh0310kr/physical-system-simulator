import { defineBehavior, numberOf } from "@physisim/core";

/**
 * CdS 광저항: 밝기 `light`(0 = 어두움, 1 = 밝음)에 따라 어두울 때 저항과 밝을 때 저항 사이를 로그 보간한다.
 * 두 끝값은 제품 값이고, 사이 곡선은 광저항의 대략적인 지수 특성에 대한 가정이다.
 */
export const photoresistor = defineBehavior<Record<string, never>>({
  id: "behavior.photoresistor",
  init: () => ({}),
  circuit: (_s, ctx) => [
    { kind: "resistor", id: "r", a: "1", b: "2", resistance: resistanceOf(ctx.properties) },
  ],
  step: (state, _inputs, ctx) => ({
    state,
    outputs: { resistance: resistanceOf(ctx.properties), current: ctx.circuit?.current("r") ?? 0 },
  }),
});

function resistanceOf(properties: Parameters<typeof numberOf>[0]): number {
  const light = Math.min(1, Math.max(0, numberOf(properties, "light")));
  const dark = numberOf(properties, "darkResistance");
  const bright = numberOf(properties, "lightResistance");
  return dark * (bright / dark) ** light;
}
