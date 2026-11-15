import { buildSystem, SystemSchema } from "@physisim/core";
import { createSimulation, recordTrace } from "@physisim/engine";
import { createStandardRegistry } from "@physisim/models";
import { describe, expect, it } from "vitest";

const registry = createStandardRegistry();

/** 셀 → 부하 저항. 셀 속성은 override. */
function discharge(load: string, cell: Record<string, unknown>, seconds: number) {
  const built = buildSystem(
    registry,
    SystemSchema.parse({
      name: "discharge",
      instances: [
        { id: "bat", model: "model.li-ion-cell", properties: cell },
        { id: "load", model: "model.resistor", properties: { resistance: load } },
      ],
      connections: [
        ["bat:+", "load:1"],
        ["load:2", "bat:-"],
      ],
    }),
  );
  if (!built.ok) throw new Error(JSON.stringify(built.issues));
  const sim = createSimulation(registry, built.value);
  const rec = recordTrace(sim);
  sim.run(seconds);
  return rec.stop().final;
}

describe("li-ion cell", () => {
  it("sags under load: terminal = open-circuit × load / (load + internal resistance)", () => {
    const f = discharge("10Ω", { capacity: 1000 }, 0.01);
    expect(f["bat.voltage"]).toBeCloseTo((4.2 * 10) / 10.15, 3);
    expect(f["bat.current"]).toBeCloseTo(4.2 / 10.15, 3);
  });

  it("integrates the charge and energy that left the cell", () => {
    const f = discharge("10Ω", { capacity: 1000 }, 10);
    const i = 4.2 / 10.15; // 10초 동안 거의 일정
    expect(Number(f["bat.charge"])).toBeCloseTo(i * 10, 1); // C
    const terminal = (4.2 * 10) / 10.15;
    expect(Number(f["bat.energy"])).toBeCloseTo(terminal * i * 10, 1); // J = V·I·t
    expect(Number(f["bat.soc"])).toBeCloseTo(1 - (i * 10) / 3600, 4);
  });

  it("starts from initialSoc and lowers its voltage as it discharges", () => {
    const half = discharge("10Ω", { capacity: 1000, initialSoc: 0.5 }, 0.01);
    expect(half["bat.voltage"]).toBeCloseTo(((3.0 + 1.2 * 0.5) * 10) / 10.15, 2);
  });

  it("empties at the end of its capacity and stops at 0", () => {
    // 0.01 mAh 셀을 5Ω으로 방전하면 수 초 안에 비운다
    const f = discharge("5Ω", { capacity: 0.01 }, 30);
    expect(f["bat.soc"]).toBe(0);
    expect(Number(f["bat.voltage"])).toBeCloseTo((3.0 * 5) / 5.15, 2); // emptyVoltage
  });
});
