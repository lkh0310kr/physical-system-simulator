import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { box, cylinderAlong, inspect, loadGeometry, meshOf } from "./geometry.ts";
import { writeStl } from "./stl.ts";
import { write3mf } from "./threemf.ts";
import { crc32 } from "./zip.ts";

describe("geometry", () => {
  it("subtracting a through-hole from a box keeps one closed solid with the right volume", async () => {
    const m = await loadGeometry();
    const plate = box(m, [0, 0, 0], [20, 20, 2]);
    const hole = cylinderAlong(m, 2, -1, 3, [10, 10], 4);
    const r = inspect(plate.subtract(hole));
    expect(r.closed).toBe(true);
    expect(r.components).toBe(1);
    // 20·20·2 − π·2²·2 (48각형 근사라 약간 작다)
    expect(r.volume).toBeCloseTo(800 - Math.PI * 4 * 2, 0);
    expect(r.min).toEqual([0, 0, 0]);
    expect(r.max).toEqual([20, 20, 2]);
  });

  it("places cylinders along x and y axes at the requested position", async () => {
    const m = await loadGeometry();
    const x = inspect(cylinderAlong(m, 0, 5, 15, [3, 4], 2));
    expect(x.min[0]).toBeCloseTo(5);
    expect(x.max[0]).toBeCloseTo(15);
    expect((x.min[1] + x.max[1]) / 2).toBeCloseTo(3);
    expect((x.min[2] + x.max[2]) / 2).toBeCloseTo(4);
    const y = inspect(cylinderAlong(m, 1, -2, 6, [3, 4], 2));
    expect(y.min[1]).toBeCloseTo(-2);
    expect(y.max[1]).toBeCloseTo(6);
    expect((y.min[0] + y.max[0]) / 2).toBeCloseTo(3);
    expect((y.min[2] + y.max[2]) / 2).toBeCloseTo(4);
  });

  it("detects separate pieces as multiple components", async () => {
    const m = await loadGeometry();
    const two = box(m, [0, 0, 0], [1, 1, 1]).add(box(m, [5, 0, 0], [6, 1, 1]));
    expect(inspect(two).components).toBe(2);
  });

  it("writes a binary STL with 12 triangles for a cube", async () => {
    const m = await loadGeometry();
    const stl = writeStl(meshOf(box(m, [0, 0, 0], [1, 2, 3])));
    expect(stl.length).toBe(84 + 12 * 50);
    expect(new DataView(stl.buffer).getUint32(80, true)).toBe(12);
  });

  it("writes a 3MF that is a valid zip with the model inside", async () => {
    const m = await loadGeometry();
    const data = write3mf([{ name: "cube", mesh: meshOf(box(m, [0, 0, 0], [1, 1, 1])) }]);
    const dir = mkdtempSync(join(tmpdir(), "physisim-3mf-"));
    const file = join(dir, "t.3mf");
    writeFileSync(file, data);
    // unzip -t가 CRC까지 검사한다
    expect(execFileSync("unzip", ["-t", file]).toString()).toContain("No errors detected");
    expect(execFileSync("unzip", ["-p", file, "3D/3dmodel.model"]).toString()).toContain(
      'unit="millimeter"',
    );
  });

  it("computes the standard CRC-32 check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});
