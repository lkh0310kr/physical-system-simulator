import { describe, expect, it } from "vitest";
import { createCircuitSolver, type NodeElement } from "./circuit-solver.ts";

const solve = (nodeCount: number, elements: NodeElement[]) =>
  createCircuitSolver().solve(nodeCount, elements);

describe("circuit solver", () => {
  it("solves a voltage divider driven from a source", () => {
    // 5V --(1Ω 내부)-- n1 --1kΩ-- n2 --1kΩ-- GND
    const s = solve(3, [
      { kind: "drive", id: "src", node: 1, voltage: 5, resistance: 1e-6 },
      { kind: "resistor", id: "r1", a: 1, b: 2, resistance: 1000 },
      { kind: "resistor", id: "r2", a: 2, b: 0, resistance: 1000 },
    ]);
    expect(s.voltages[2]).toBeCloseTo(2.5, 6);
    expect(s.currents.get("r1")).toBeCloseTo(0.0025, 9);
    expect(s.currents.get("src")).toBeCloseTo(0.0025, 9);
  });

  it("accounts for the source's internal resistance", () => {
    const s = solve(2, [
      { kind: "drive", id: "src", node: 1, voltage: 5, resistance: 25 },
      { kind: "resistor", id: "r", a: 1, b: 0, resistance: 225 },
    ]);
    expect(s.voltages[1]).toBeCloseTo(4.5, 9);
  });

  it("conducts a forward-biased diode above its forward voltage", () => {
    // 5V/25Ω → 220Ω → LED(2V, 10Ω) → GND : I = 3 / 255
    const s = solve(3, [
      { kind: "drive", id: "pin", node: 1, voltage: 5, resistance: 25 },
      { kind: "resistor", id: "r", a: 1, b: 2, resistance: 220 },
      { kind: "diode", id: "led", anode: 2, cathode: 0, forwardVoltage: 2, onResistance: 10 },
    ]);
    expect(s.converged).toBe(true);
    expect(s.currents.get("led")).toBeCloseTo(3 / 255, 6);
  });

  it("blocks a diode below its forward voltage or in reverse", () => {
    const below = solve(2, [
      { kind: "drive", id: "pin", node: 1, voltage: 1.5, resistance: 25 },
      { kind: "diode", id: "led", anode: 1, cathode: 0, forwardVoltage: 2, onResistance: 10 },
    ]);
    expect(Math.abs(below.currents.get("led") ?? 1)).toBeLessThan(1e-8);
    const reverse = solve(2, [
      { kind: "drive", id: "pin", node: 1, voltage: 5, resistance: 25 },
      { kind: "diode", id: "led", anode: 0, cathode: 1, forwardVoltage: 2, onResistance: 10 },
    ]);
    expect(Math.abs(reverse.currents.get("led") ?? 1)).toBeLessThan(1e-8);
  });

  it("turns a conducting diode off when the source drops", () => {
    const solver = createCircuitSolver();
    const circuit = (v: number): NodeElement[] => [
      { kind: "drive", id: "pin", node: 1, voltage: v, resistance: 25 },
      { kind: "diode", id: "led", anode: 1, cathode: 0, forwardVoltage: 2, onResistance: 10 },
    ];
    expect(solver.solve(2, circuit(5)).currents.get("led")).toBeGreaterThan(0.01);
    expect(Math.abs(solver.solve(2, circuit(0)).currents.get("led") ?? 1)).toBeLessThan(1e-8);
  });

  it("draws a constant current through the source resistance (V = Vs − I·Rs)", () => {
    const s = solve(2, [
      { kind: "drive", id: "bat", node: 1, voltage: 4, resistance: 0.5 },
      { kind: "load", id: "mcu", node: 1, current: 0.2 },
    ]);
    expect(s.voltages[1]).toBeCloseTo(4 - 0.2 * 0.5, 9);
    expect(s.currents.get("bat")).toBeCloseTo(0.2, 9);
    expect(s.currents.get("mcu")).toBe(0.2);
  });

  it("keeps floating nodes finite", () => {
    const s = solve(3, [{ kind: "resistor", id: "r", a: 1, b: 2, resistance: 100 }]);
    expect(s.voltages.every(Number.isFinite)).toBe(true);
  });

  it("forces a current source's current from a to b (node 0 → node 1 raises V1 by I·R)", () => {
    const solver = createCircuitSolver();
    const r = solver.solve(2, [
      { kind: "resistor", id: "r", a: 1, b: 0, resistance: 10 },
      { kind: "source", id: "i", a: 0, b: 1, current: 0.5 },
    ]);
    expect(r.voltages[1]).toBeCloseTo(5, 6);
    expect(r.currents.get("i")).toBe(0.5);
  });
});
