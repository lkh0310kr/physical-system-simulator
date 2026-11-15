import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fdmProfile, resolveProfile } from "@physisim/cad";
import { describe, expect, it } from "vitest";
import { writeCase } from "./case.ts";
import { loadSystemFile } from "./simulate.ts";

const file = "examples/camera-case-xiao-s3-sense.system.json";
const load = () => {
  const r = loadSystemFile(file);
  if (!r.ok) throw new Error("load failed");
  return r.value;
};

/** 바이너리 STL의 부호 있는 부피 [mm³]: 바깥쪽 법선이면 양수. */
function signedVolume(stl: Buffer): number {
  const n = stl.readUInt32LE(80);
  let v = 0;
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50 + 12;
    const p = (j: number) => [0, 1, 2].map((k) => stl.readFloatLE(o + j * 12 + k * 4));
    const [a, b, c] = [p(0), p(1), p(2)] as [number[], number[], number[]];
    v +=
      ((a[0] ?? 0) * ((b[1] ?? 0) * (c[2] ?? 0) - (b[2] ?? 0) * (c[1] ?? 0)) -
        (a[1] ?? 0) * ((b[0] ?? 0) * (c[2] ?? 0) - (b[2] ?? 0) * (c[0] ?? 0)) +
        (a[2] ?? 0) * ((b[0] ?? 0) * (c[1] ?? 0) - (b[1] ?? 0) * (c[0] ?? 0))) /
      6;
  }
  return v;
}

describe("physisim case", () => {
  it("writes base/lid STL, 3MF and BOM CSV for the XIAO camera example", async () => {
    const dir = mkdtempSync(join(tmpdir(), "physisim-case-"));
    const out = await writeCase(load(), fdmProfile, dir, file);
    expect(out.ok).toBe(true);
    expect(out.files.map((f) => f.split("/").pop())).toEqual([
      "camera-case-xiao-s3-sense-base.stl",
      "camera-case-xiao-s3-sense-lid.stl",
      "camera-case-xiao-s3-sense-case.3mf",
      "camera-case-xiao-s3-sense-bom.csv",
    ]);
    for (const f of out.files) expect(existsSync(f)).toBe(true);
  });

  it("exported STLs enclose a positive volume (outward-facing, watertight-consistent)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "physisim-case-"));
    const out = await writeCase(load(), fdmProfile, dir, file);
    for (const f of out.files.filter((p) => p.endsWith(".stl"))) {
      expect(signedVolume(readFileSync(f))).toBeGreaterThan(1000);
    }
  });

  it("writes nothing when validation fails", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "physisim-case-")), "out");
    const p = resolveProfile({ buildVolume: [20, 20, 20] });
    if (!p.ok) throw new Error(p.message);
    const out = await writeCase(load(), p.value, dir, file);
    expect(out.ok).toBe(false);
    expect(out.files).toEqual([]);
    expect(existsSync(dir)).toBe(false);
    expect(out.summary).toContain("파일을 쓰지 않았다");
  });
});
