import { defineBehavior, numberOf } from "@physisim/core";

type Inputs = { current: number };
type Outputs = { brightness: number };

/** 밝기 = 전류 / 최대 전류 (0~1로 제한). 역방향·과전류 소손은 Phase 6에서 다룬다. */
export const led = defineBehavior<Record<string, never>, Inputs, Outputs>({
  id: "behavior.led",
  init: () => ({}),
  step: (state, { current }, ctx) => {
    const ratio = current / numberOf(ctx.properties, "maxCurrent");
    return { state, outputs: { brightness: Math.min(1, Math.max(0, ratio)) } };
  },
});
