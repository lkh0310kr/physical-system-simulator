import { defineBehavior, numberOf } from "@physisim/core";

const clamp = (v: number) => Math.min(1, Math.max(-1, v));

/** 직진 `cruise`에 조향 신호 × `gain`을 더하고 뺀다: 조향이 +면 오른쪽이 빨라져 왼쪽으로 돈다. 신호가 없으면 직진. */
export const steeringMixer = defineBehavior<Record<string, never>>({
  id: "behavior.steering-mixer",
  init: () => ({}),
  step: (state, inputs, ctx) => {
    const steer = Number(inputs.steer ?? 0);
    const cruise = numberOf(ctx.properties, "cruise");
    const gain = numberOf(ctx.properties, "gain");
    return {
      state,
      outputs: { left: clamp(cruise - gain * steer), right: clamp(cruise + gain * steer) },
    };
  },
});
