import { defineBehavior, numberOf } from "@physisim/core";

/** 파형: 사인 / 사각 / 삼각. 값은 −1~1이고 `offset + amplitude × 파형`을 낸다. */
export const signalSource = defineBehavior<Record<string, never>>({
  id: "behavior.signal-source",
  init: () => ({}),
  step: (state, _inputs, ctx) => {
    const phase = numberOf(ctx.properties, "frequency") * ctx.time;
    const frac = phase - Math.floor(phase);
    const shape = String(ctx.properties.waveform ?? "sine");
    const wave =
      shape === "square"
        ? frac < 0.5
          ? 1
          : -1
        : shape === "triangle"
          ? 1 - 4 * Math.abs(frac - 0.5)
          : Math.sin(2 * Math.PI * phase);
    return {
      state,
      outputs: {
        out: numberOf(ctx.properties, "offset") + numberOf(ctx.properties, "amplitude") * wave,
      },
    };
  },
});
