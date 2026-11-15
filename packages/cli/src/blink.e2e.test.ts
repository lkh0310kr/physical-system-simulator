import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withPrefix } from "./format.ts";
import { loadSystemFile, runLoaded } from "./simulate.ts";

const file = join(import.meta.dirname, "../../../examples/blink-led.system.json");

function run(duration = 2) {
  const loaded = loadSystemFile(file);
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.issues));
  return runLoaded(loaded.value, { duration });
}

describe("E2E: examples/blink-led", () => {
  const { trace, programErrors } = run();
  const changes = (signal: string) =>
    trace.entries.filter((e) => e.signal === signal).map((e) => [e.time, e.value]);

  it("runs the program without errors", () => {
    expect(programErrors).toEqual({});
  });

  it("toggles D13 and the LED at 1 Hz", () => {
    expect(changes("uno.D13")).toEqual([
      [0, true],
      [0.5, false],
      [1, true],
      [1.5, false],
      [2, true],
    ]);
    expect(changes("led1.brightness").map(([t]) => t)).toEqual([0, 0.5, 1, 1.5, 2]);
  });

  it("drives the LED current the circuit predicts: (5V − 2V) / (25Ω + 220Ω + 10Ω)", () => {
    const expected = 3 / 255;
    expect(trace.entries.find((e) => e.signal === "r1.current")?.value).toBeCloseTo(expected, 9);
    expect(trace.entries.find((e) => e.signal === "led1.brightness")?.value).toBeCloseTo(
      expected / 0.02,
      9,
    );
  });

  it("produces the same trace on every run", () => {
    expect(JSON.stringify(run().trace)).toBe(JSON.stringify(trace));
  });
});

describe("withPrefix", () => {
  it("formats SI values with a metric prefix", () => {
    expect(withPrefix(3 / 255, "A")).toBe("11.8 mA");
    expect(withPrefix(16e6, "Hz")).toBe("16 MHz");
    expect(withPrefix(0, "A")).toBe("0 A");
  });
});
