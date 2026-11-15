import { readFileSync } from "node:fs";
import { join } from "node:path";
import { startPrograms } from "@physisim/avr";
import { createSimulation, recordTrace } from "@physisim/engine";
import { describe, expect, it } from "vitest";
import { loadSystemFile } from "./simulate.ts";

const root = join(import.meta.dirname, "../../..");
const hex = readFileSync(join(root, "packages/avr/src/fixtures/button.hex"), "utf8");

describe("E2E: examples/button-led (real firmware, human input)", () => {
  const loaded = loadSystemFile(join(root, "examples/button-led.system.json"));
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.issues));
  const sim = createSimulation(loaded.value.registry, loaded.value.system);
  const programs = startPrograms(sim, loaded.value, new Map([["uno", hex]]));
  const rec = recordTrace(sim);

  const led = (t: number) => {
    const trace = rec.snapshot();
    const last = trace.entries.filter((e) => e.signal === "led1.brightness" && e.time <= t).at(-1);
    return Number(last?.value ?? 0);
  };

  // 0.3 s 눌렀다가 0.3 s 뒤에 뗀다.
  sim.schedule(0.3, () => sim.dispatch("btn", "capability.switching", { type: "press" }));
  sim.schedule(0.6, () => sim.dispatch("btn", "capability.switching", { type: "release" }));
  sim.run(1);
  const serial = programs[0]?.[1].serial ?? [];

  it("keeps the LED off until the button is pressed", () => {
    expect(led(0.25)).toBe(0);
  });

  it("lights the LED while pressed and turns it off after release", () => {
    expect(led(0.5)).toBeGreaterThan(0.5);
    expect(led(0.9)).toBe(0);
  });

  it("reports the state changes over Serial", () => {
    const texts = serial.map((l) => l.text);
    expect(texts[0]).toBe("released");
    expect(texts).toContain("pressed");
    expect(texts.at(-1)).toBe("released");
  });
});
