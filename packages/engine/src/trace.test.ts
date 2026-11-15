import type { Signals } from "@physisim/core";
import { describe, expect, it } from "vitest";
import type { Simulation, StepInfo } from "./simulation.ts";
import { recordTrace } from "./trace.ts";

/** onStep만 흉내 내는 가짜 Simulation. `emit`으로 스텝을 흘려 보낸다. */
function fakeSim() {
  const listeners = new Set<(i: StepInfo) => void>();
  const sim = {
    onStep: (l: (i: StepInfo) => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  } as unknown as Simulation;
  const emit = (time: number, led: number, pin: boolean) => {
    const outputs = new Map<string, Map<string, Signals>>([
      ["led1", new Map([["capability.light-emission", { brightness: led }]])],
      ["uno", new Map([["capability.gpio", { D13: pin }]])],
    ]);
    for (const l of listeners) l({ time, outputs });
  };
  return { sim, emit };
}

describe("recordTrace", () => {
  it("records only changes, named instance.output", () => {
    const { sim, emit } = fakeSim();
    const rec = recordTrace(sim);
    emit(0, 0.6, true);
    emit(0.001, 0.6, true);
    emit(0.5, 0, false);
    expect(rec.stop()).toEqual({
      entries: [
        { time: 0, signal: "led1.brightness", value: 0.6 },
        { time: 0, signal: "uno.D13", value: true },
        { time: 0.5, signal: "led1.brightness", value: 0 },
        { time: 0.5, signal: "uno.D13", value: false },
      ],
      final: { "led1.brightness": 0, "uno.D13": false },
      steps: 3,
    });
  });

  it("ignores numeric noise below the tolerance", () => {
    const { sim, emit } = fakeSim();
    const rec = recordTrace(sim);
    emit(0, 0.6, true);
    emit(0.001, 0.6 + 1e-13, true);
    expect(rec.stop().entries).toHaveLength(2);
  });

  it("stops recording after stop()", () => {
    const { sim, emit } = fakeSim();
    const rec = recordTrace(sim);
    const trace = rec.stop();
    emit(0, 1, true);
    expect(trace.steps).toBe(0);
    expect(rec.snapshot().steps).toBe(0);
  });
});
