import { loadSystemProject } from "@physisim/core";
import { createStandardRegistry } from "@physisim/models";
import { describe, expect, it } from "vitest";
import { runLoaded } from "./simulate.ts";

/** 배터리 → (저항) → LED → 배터리. */
function load(withResistor: boolean) {
  const r = loadSystemProject(
    {
      name: "led-burn",
      instances: [
        { id: "bat", model: "model.li-ion-cell", properties: { capacity: 1000 } },
        { id: "led", model: "model.led" },
        ...(withResistor
          ? [{ id: "r", model: "model.resistor", properties: { resistance: "220Ω" } }]
          : []),
      ],
      connections: withResistor
        ? [
            ["bat:+", "r:1"],
            ["r:2", "led:A"],
            ["led:C", "bat:-"],
          ]
        : [
            ["bat:+", "led:A"],
            ["led:C", "bat:-"],
          ],
    },
    () => undefined,
    createStandardRegistry,
  );
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

describe("LED burn-out (P6-T4)", () => {
  it("burns when driven far above its absolute maximum current, then stays dark and open", () => {
    const run = runLoaded(load(false), { duration: 1, dt: 0.001, presses: [] }, new Map());
    expect(run.trace.final["led.burnt"]).toBe(true);
    expect(run.trace.final["led.brightness"]).toBe(0);
  });

  it("survives with a series resistor at a normal current", () => {
    const run = runLoaded(load(true), { duration: 1, dt: 0.001, presses: [] }, new Map());
    expect(run.trace.final["led.burnt"]).toBe(false);
    expect(Number(run.trace.final["led.brightness"])).toBeGreaterThan(0.3);
  });
});
