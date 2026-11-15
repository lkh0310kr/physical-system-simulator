import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withPrefix } from "./format.ts";
import { loadSystemFile, runLoaded } from "./simulate.ts";

const root = join(import.meta.dirname, "../../..");
const file = join(root, "examples/blink-led.system.json");
// CI에는 arduino-cli가 없으므로 같은 스케치를 미리 컴파일한 펌웨어를 쓴다.
const fixtureSketch = join(root, "packages/avr/src/fixtures/blink.ino");
const fixtureHex = readFileSync(join(root, "packages/avr/src/fixtures/blink.hex"), "utf8");

/** 2초 + 펌웨어 구간(1ms)만큼의 여유. */
function run(duration = 2.1) {
  const loaded = loadSystemFile(file);
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.issues));
  return runLoaded(loaded.value, { duration }, new Map([["uno", fixtureHex]]));
}

describe("E2E: examples/blink-led (real Arduino firmware)", () => {
  it("uses the same sketch as the precompiled fixture", () => {
    expect(readFileSync(join(root, "examples/blink.ino"), "utf8")).toBe(
      readFileSync(fixtureSketch, "utf8"),
    );
  });

  const { trace, programErrors, serial } = run();
  const changes = (signal: string) =>
    trace.entries.filter((e) => e.signal === signal).map((e) => [e.time, e.value] as const);

  it("runs the firmware without errors", () => {
    expect(programErrors).toEqual({});
  });

  it("toggles D13 and the LED at 1 Hz (within the 1 ms firmware slice)", () => {
    const d13 = changes("uno.D13");
    expect(d13.map(([, v]) => v)).toEqual([true, false, true, false, true]);
    for (const [i, [t]] of d13.entries()) expect(t).toBeCloseTo(i * 0.5, 2);
  });

  it("drives the LED current the circuit predicts: (5V − 2V) / (25Ω + 220Ω + 10Ω)", () => {
    const expected = 3 / 255;
    const lit = trace.entries.find((e) => e.signal === "r1.current" && Number(e.value) > 0);
    expect(lit?.value).toBeCloseTo(expected, 9);
  });

  it("prints the sketch's Serial output", () => {
    expect(serial.uno?.map((l) => l.text)).toEqual(["on", "off", "on", "off", "on"]);
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
