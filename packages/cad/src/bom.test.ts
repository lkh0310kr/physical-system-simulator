import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSystemProject } from "@physisim/core";
import { createStandardRegistry } from "@physisim/models";
import { describe, expect, it } from "vitest";
import { bomCsv, bomOf, formatBom } from "./bom.ts";
import { fdmProfile } from "./process.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const path = resolve(root, "examples/camera-case-xiao-s3-sense.system.json");
const r = loadSystemProject(
  JSON.parse(readFileSync(path, "utf8")),
  () => "",
  createStandardRegistry,
);
if (!r.ok) throw new Error("example failed to load");

describe("bom", () => {
  const bom = bomOf(r.value, [{ name: "base", volumeMm3: 5000 }], fdmProfile);

  it("lists the XIAO board and the LiPo as purchased parts with source links", () => {
    expect(bom.purchased.map((l) => l.mpn)).toEqual(["1317", "5639 (Seeed product page id)"]);
    expect(bom.purchased.every((l) => l.url?.startsWith("https://"))).toBe(true);
  });

  it("keeps modeling-only instances out of the shopping list", () => {
    expect(bom.modelOnly.map((m) => m.instance).sort()).toEqual(["btn", "node"]);
  });

  it("estimates printed mass from volume and process density", () => {
    expect(bom.printed[0]?.massG).toBeCloseTo(5 * 1.24, 6);
  });

  it("writes a CSV with one row per purchased part", () => {
    const rows = bomCsv(bom).trim().split("\n");
    expect(rows).toHaveLength(1 + bom.purchased.length);
    expect(rows[1]).toContain("Adafruit");
  });

  it("text summary names the open assumptions of purchased parts", () => {
    expect(formatBom(bom, fdmProfile)).toContain("확인 필요");
  });
});
