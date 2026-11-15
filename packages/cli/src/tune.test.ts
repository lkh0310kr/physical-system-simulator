import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gridOf, parseConstraint, parseRange, satisfies, tuneSystem } from "./tune.ts";

function circuit() {
  const dir = mkdtempSync(join(tmpdir(), "physisim-tune-"));
  const file = join(dir, "c.system.json");
  writeFileSync(
    file,
    JSON.stringify({
      name: "c",
      instances: [
        { id: "bat", model: "model.li-ion-cell", properties: { capacity: 1000 } },
        { id: "r1", model: "model.resistor" },
        { id: "led1", model: "model.led" },
      ],
      connections: [
        ["bat:+", "r1:1"],
        ["r1:2", "led1:A"],
        ["led1:C", "bat:-"],
      ],
    }),
  );
  return file;
}

describe("tune helpers", () => {
  it("parses ranges and constraints, and rejects malformed ones", () => {
    const r = parseRange("r1.resistance=50..2000");
    expect(r.ok && [r.value.lo, r.value.hi]).toEqual([50, 2000]);
    expect(parseRange("r1.resistance=2000..50").ok).toBe(false);
    const c = parseConstraint("r1.current<=0.02");
    expect(c.ok && c.value).toEqual({ signal: "r1.current", op: "<=", value: 0.02 });
    const b = parseConstraint("led1.burnt=false");
    expect(b.ok && b.value.value).toBe(false);
    expect(parseConstraint("nonsense").ok).toBe(false);
  });

  it("checks constraints with the right statistic (max for <=, min for >=, final for =)", () => {
    const stat = { final: false, min: 1, max: 3 };
    expect(satisfies({ signal: "s", op: "<=", value: 3 }, stat)).toBe(true);
    expect(satisfies({ signal: "s", op: "<=", value: 2 }, stat)).toBe(false);
    expect(satisfies({ signal: "s", op: ">=", value: 1 }, stat)).toBe(true);
    expect(satisfies({ signal: "s", op: "=", value: false }, stat)).toBe(true);
    expect(satisfies({ signal: "s", op: "=", value: false }, undefined)).toBe(false);
  });

  it("uses log spacing for wide positive ranges and linear otherwise", () => {
    const g = gridOf(1, 1000, 4);
    expect(g.map((v) => Math.round(v))).toEqual([1, 10, 100, 1000]);
    expect(gridOf(0, 10, 3)).toEqual([0, 5, 10]);
  });
});

describe("tune", () => {
  it("finds the series resistor that gives the brightest LED within 20 mA and without burning it", async () => {
    const r = await tuneSystem(
      circuit(),
      { instance: "r1", key: "resistance", lo: 20, hi: 2000 },
      { signal: "led1.brightness", direction: "max" },
      [
        { signal: "led1.burnt", op: "=", value: false },
        { signal: "r1.current", op: "<=", value: 0.02 },
      ],
      { duration: 0.5, dt: 0.001 },
    );
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    // (4.2 V − 2 V) / (0.15 Ω + 10 Ω + R) = 20 mA → R ≈ 100 Ω
    expect(r.value.best?.value).toBeGreaterThan(95);
    expect(r.value.best?.value).toBeLessThan(115);
    expect(r.value.best?.feasible).toBe(true);
  });

  it("reports no solution when the constraints cannot be met in the range", async () => {
    const r = await tuneSystem(
      circuit(),
      { instance: "r1", key: "resistance", lo: 1, hi: 5 },
      { signal: "led1.brightness", direction: "max" },
      [{ signal: "led1.burnt", op: "=", value: false }],
      { duration: 0.5, dt: 0.001 },
    );
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.value.best).toBeUndefined();
  });
});
