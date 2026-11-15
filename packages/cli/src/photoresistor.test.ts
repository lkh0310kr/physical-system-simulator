import { loadSystemProject } from "@physisim/core";
import { createStandardRegistry } from "@physisim/models";
import { describe, expect, it } from "vitest";
import { runLoaded } from "./simulate.ts";

/** 배터리 4.2 V → 10 kΩ → 광저항 → 접지 분압 (분압점 전압을 멀티미터로 읽는다). */
const divider = (light: number) => {
  const r = loadSystemProject(
    {
      name: "ldr",
      instances: [
        { id: "bat", model: "model.li-ion-cell", properties: { capacity: 1000 } },
        { id: "r1", model: "model.resistor", properties: { resistance: "10kΩ" } },
        { id: "ldr", model: "model.photoresistor", properties: { light } },
        { id: "dmm", model: "model.multimeter" },
      ],
      connections: [
        ["bat:+", "r1:1"],
        ["r1:2", "ldr:1"],
        ["ldr:2", "bat:-"],
        ["dmm:V", "ldr:1"],
        ["dmm:COM", "ldr:2"],
      ],
    },
    () => undefined,
    createStandardRegistry,
  );
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return runLoaded(r.value, { duration: 0.05, dt: 0.001, presses: [] }, new Map()).trace.final;
};

describe("photoresistor", () => {
  it("has the product's endpoint resistances: about 10 kΩ in the dark and 1 kΩ in the light", () => {
    expect(Number(divider(0)["ldr.resistance"])).toBeCloseTo(10000, 0);
    expect(Number(divider(1)["ldr.resistance"])).toBeCloseTo(1000, 0);
  });

  it("the divider voltage falls as it gets brighter (the signal a microcontroller would read)", () => {
    const dark = Number(divider(0)["dmm.reading"]);
    const mid = Number(divider(0.5)["dmm.reading"]);
    const bright = Number(divider(1)["dmm.reading"]);
    expect(dark).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(bright);
    // 어두움: 10k/(10k+10k) ≈ 2.1 V, 밝음: 1k/(10k+1k) ≈ 0.38 V (배터리 내부 저항 무시 정도)
    expect(dark).toBeCloseTo(2.1, 1);
    expect(bright).toBeCloseTo(0.38, 1);
  });
});
