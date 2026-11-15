import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { combinations, formatSweep, parseAxis, sweepSystem } from "./sweep.ts";

function circuit() {
  const dir = mkdtempSync(join(tmpdir(), "physisim-sweep-"));
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

describe("sweep", () => {
  it("parses instance.property=values and rejects malformed axes", () => {
    const ok = parseAxis("r1.resistance=100, 220Ω ,470");
    expect(ok.ok && ok.value.values).toEqual(["100", "220Ω", "470"]);
    expect(parseAxis("r1=3").ok).toBe(false);
    expect(parseAxis("r1.resistance=").ok).toBe(false);
  });

  it("expands every combination of the axes", () => {
    const a = { instance: "r1", key: "resistance", values: ["1", "2"] };
    const b = { instance: "led1", key: "maxCurrent", values: ["10", "20", "30"] };
    expect(combinations([a, b])).toHaveLength(6);
    expect(combinations([])).toEqual([{}]);
  });

  it("shows the LED current (peak) falling as the series resistance grows, and burns it with a tiny resistor", async () => {
    const r = await sweepSystem(
      circuit(),
      [{ instance: "r1", key: "resistance", values: ["1", "220", "1000"] }],
      ["r1.current", "led1.burnt"],
      { duration: 1, dt: 0.001 },
    );
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    const currents = r.value.map((row) => Number(row.stats["r1.current"]?.max));
    expect(currents[0]).toBeGreaterThan(currents[1] ?? 0);
    expect(currents[1]).toBeGreaterThan(currents[2] ?? 0);
    expect(r.value.map((row) => row.stats["led1.burnt"]?.final)).toEqual([true, false, false]);
    expect(formatSweep(r.value, ["r1.current"])).toContain("r1.resistance");
  });

  it("reports an unknown instance instead of silently ignoring it", async () => {
    const r = await sweepSystem(
      circuit(),
      [{ instance: "nope", key: "x", values: ["1"] }],
      ["r1.current"],
      { duration: 0.1 },
    );
    expect(r.ok).toBe(false);
  });
});
