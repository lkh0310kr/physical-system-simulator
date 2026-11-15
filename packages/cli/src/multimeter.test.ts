import { loadSystemProject } from "@physisim/core";
import { createStandardRegistry } from "@physisim/models";
import { describe, expect, it } from "vitest";
import { runLoaded } from "./simulate.ts";

const load = (probe: [string, string], inputResistance?: string) => {
  const r = loadSystemProject(
    {
      name: "dmm",
      instances: [
        { id: "bat", model: "model.li-ion-cell", properties: { capacity: 1000 } },
        { id: "r", model: "model.resistor", properties: { resistance: "220Ω" } },
        { id: "led", model: "model.led" },
        {
          id: "dmm",
          model: "model.multimeter",
          ...(inputResistance ? { properties: { inputResistance } } : {}),
        },
      ],
      connections: [
        ["bat:+", "r:1"],
        ["r:2", "led:A"],
        ["led:C", "bat:-"],
        [`dmm:V`, probe[0]],
        [`dmm:COM`, probe[1]],
      ],
    },
    () => undefined,
    createStandardRegistry,
  );
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
};

const run = (loaded: ReturnType<typeof load>) =>
  runLoaded(loaded, { duration: 0.1, dt: 0.001, presses: [] }, new Map()).trace.final;

describe("multimeter (DC voltage)", () => {
  it("reads the voltage drop across the resistor: I × R", () => {
    const f = run(load(["r:1", "r:2"]));
    expect(Number(f["dmm.reading"])).toBeCloseTo(Number(f["r.current"]) * 220, 2);
  });

  it("reads the battery voltage across the supply and does not disturb the circuit much", () => {
    const f = run(load(["bat:+", "bat:-"]));
    const loadedV = Number(f["dmm.reading"]);
    // 만충 4.2 V에서 내부 저항 전압강하만큼 처진 값
    expect(loadedV).toBeGreaterThan(4.0);
    expect(loadedV).toBeLessThan(4.2);
  });

  it("a low input resistance loads the circuit and the reading sags (loading effect)", () => {
    const ideal = Number(run(load(["r:2", "led:C"]))["dmm.reading"]);
    const loading = Number(run(load(["r:2", "led:C"], "1kΩ"))["dmm.reading"]);
    expect(loading).toBeLessThan(ideal);
  });
});
