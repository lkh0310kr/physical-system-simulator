import { join } from "node:path";
import { createSimulation, recordTrace } from "@physisim/engine";
import { describe, expect, it } from "vitest";
import { loadSystemFile } from "./simulate.ts";

const file = join(import.meta.dirname, "../../../examples/camera-case-a.system.json");

/** `presses`: 누르는 시각들. `holdFor`: 누르고 있는 시간 [s]. */
function run(seconds: number, presses: number[], holdFor = 0.2) {
  const loaded = loadSystemFile(file);
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.issues));
  const sim = createSimulation(loaded.value.registry, loaded.value.system);
  for (const t of presses) {
    sim.schedule(t, () => sim.dispatch("btn", "capability.switching", { type: "press" }));
    sim.schedule(t + holdFor, () =>
      sim.dispatch("btn", "capability.switching", { type: "release" }),
    );
  }
  const rec = recordTrace(sim);
  sim.run(seconds);
  return rec.stop();
}

describe("E2E: Wearable Camera — Case A (behavior model)", () => {
  const trace = run(3, [1]);
  const at = (signal: string, value: unknown) =>
    trace.entries.find((e) => e.signal === signal && e.value === value)?.time;

  it("stays asleep, then walks through the wake sequence after the button press", () => {
    expect(trace.entries.filter((e) => e.signal === "node.phase").map((e) => e.value)).toEqual([
      "sleep",
      "boot",
      "capture",
      "connect",
      "transmit",
      "sleep",
    ]);
    expect(at("node.phase", "boot")).toBeCloseTo(1.0, 2);
  });

  it("records one delivered image after about 1.09 s (boot + capture + connect + transmit)", () => {
    const delivered = at("node.sent", 1);
    expect(delivered).toBeCloseTo(1.0 + 0.15 + 0.25 + 0.6 + 90000 / 1_000_000, 2);
    expect(trace.final["node.sentBytes"]).toBe(90000);
    expect(trace.final["node.wakes"]).toBe(1);
  });

  it("takes about 0.038 mAh from the battery for one capture", () => {
    // 상태별 전류 × 시간 (부하 쪽) = 0.1376 C, 배터리 쪽은 × 3.3 / (3.7 × 0.9)
    const loadCharge = 0.06 * 0.15 + 0.14 * 0.25 + 0.12 * 0.6 + 0.24 * 0.09;
    const batteryCharge = loadCharge * (3.3 / (3.7 * 0.9)) + 15e-6 * 2 * 0.99; // + 절전 약 2초
    expect(Number(trace.final["bat.charge"])).toBeCloseTo(batteryCharge, 3);
  });

  it("draws only microamps while asleep", () => {
    const asleep = run(0.5, []);
    expect(Number(asleep.final["node.current"])).toBeCloseTo(15e-6 * (3.3 / (3.7 * 0.9)), 8);
  });

  it("ignores a button that stays pressed for the whole capture: still one image", () => {
    const held = run(4, [1], 2.5); // 전송이 끝난 뒤에도 계속 누르고 있다
    expect(held.final["node.wakes"]).toBe(1);
    expect(held.final["node.sent"]).toBe(1);
  });

  it("captures again on a second press after returning to sleep", () => {
    const two = run(4, [1, 2.5]);
    expect(two.final["node.sent"]).toBe(2);
  });
});
