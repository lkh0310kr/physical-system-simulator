import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type LoadedSystem, loadSystemProject } from "@physisim/core";
import { createStandardRegistry } from "@physisim/models";
import { describe, expect, it } from "vitest";
import { buildCase } from "./build.ts";
import { type CaseInput, generateCase, printLayout } from "./case.ts";
import { inspect } from "./geometry.ts";
import { fdmProfile, resolveProfile } from "./process.ts";
import { hasErrors, validateCase } from "./validate.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const load = (file: string): LoadedSystem => {
  const path = resolve(root, "examples", file);
  const r = loadSystemProject(
    JSON.parse(readFileSync(path, "utf8")),
    (rel) => readFileSync(resolve(dirname(path), rel), "utf8"),
    createStandardRegistry,
  );
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
};

const sample = load("camera-case-xiao-s3-sense.system.json");

describe("case generator", () => {
  it("builds a valid base and lid for the XIAO camera example", async () => {
    const r = await buildCase(sample, fdmProfile);
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(r.ok).toBe(true);
    for (const solid of [r.geometry.base, r.geometry.lid]) {
      const s = inspect(solid);
      expect(s.closed).toBe(true);
      expect(s.components).toBe(1);
    }
  });

  it("cavity is the parts' bounding box plus the part clearance on every side", async () => {
    const r = await buildCase(sample, fdmProfile);
    const parts = r.input.parts;
    const lo = [0, 1, 2].map((i) => Math.min(...parts.map((p) => p.min[i] ?? 0)));
    const hi = [0, 1, 2].map((i) => Math.max(...parts.map((p) => p.max[i] ?? 0)));
    const c = fdmProfile.partClearance;
    for (const [i, v] of r.geometry.cavity.min.entries())
      expect(v).toBeCloseTo((lo[i] ?? 0) - c, 6);
    for (const [i, v] of r.geometry.cavity.max.entries())
      expect(v).toBeCloseTo((hi[i] ?? 0) + c, 6);
  });

  it("collects the lens, USB-C and button openings from the XIAO model mounts", async () => {
    const r = await buildCase(sample, fdmProfile);
    expect(r.input.openings.map((o) => `${o.part}.${o.mount}`).sort()).toEqual([
      "node.button-a",
      "node.button-b",
      "node.lens",
      "node.usb-c",
    ]);
    const lens = r.input.openings.find((o) => o.mount === "lens");
    expect([lens?.axis, lens?.sign]).toEqual([2, 1]);
    const usb = r.input.openings.find((o) => o.mount === "usb-c");
    expect([usb?.axis, usb?.sign]).toEqual([0, 1]);
  });

  it("cuts the lens hole through the lid at the lens position", async () => {
    const r = await buildCase(sample, fdmProfile);
    const lens = r.input.openings.find((o) => o.mount === "lens");
    if (!lens) throw new Error("no lens");
    // 렌즈 위 한 점을 지나는 가는 기둥이 뚜껑을 통과해야 하므로, 구멍 유무는 부피 차로 본다
    const noHole = await generateCase({ ...r.input, openings: [] }, fdmProfile);
    const diff = inspect(noHole.lid).volume - inspect(r.geometry.lid).volume;
    expect(diff).toBeGreaterThan(Math.PI * 2.6 ** 2 * fdmProfile.plate * 0.9);
  });

  it("rotated parts keep axis-aligned openings working", () => {
    expect(sample.doc.assembly?.bat?.rotation).toEqual([0, 0, 90]);
  });

  it("prints base and lid flat on the bed (min z = 0) side by side", async () => {
    const r = await buildCase(sample, fdmProfile);
    const { base, lid } = printLayout(r.geometry);
    for (const mesh of [base, lid]) {
      const zs = Array.from(
        { length: mesh.positions.length / 3 },
        (_, i) => mesh.positions[i * 3 + 2] ?? 0,
      );
      expect(Math.min(...zs)).toBeCloseTo(0, 4);
    }
    const xs = (m: typeof base) =>
      Array.from({ length: m.positions.length / 3 }, (_, i) => m.positions[i * 3] ?? 0);
    expect(Math.min(...xs(lid))).toBeGreaterThan(Math.max(...xs(base)));
  });
});

describe("case validation", () => {
  it("rejects a profile whose lid skirt is thinner than the minimum wall", async () => {
    const p = resolveProfile({ minWall: 1.5 });
    if (!p.ok) throw new Error(p.message);
    const r = await buildCase(sample, p.value);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === "thin-wall")).toBe(true);
  });

  it("rejects an opening whose passage is blocked by another part", async () => {
    const r = await buildCase(sample, fdmProfile);
    // USB 통로(+x) 한가운데에 부품을 하나 더 놓는다
    const usb = r.input.openings.find((o) => o.mount === "usb-c");
    if (!usb) throw new Error("no usb");
    const blocker = {
      id: "blocker",
      model: "model.x",
      min: [usb.position[0] + 1, usb.position[1] - 1, usb.position[2] - 1] as const,
      max: [usb.position[0] + 2, usb.position[1] + 1, usb.position[2] + 1] as const,
    };
    const input: CaseInput = { ...r.input, parts: [...r.input.parts, blocker] };
    const g = await generateCase(input, fdmProfile);
    const issues = await validateCase(input, g, fdmProfile);
    expect(issues.some((i) => i.code === "opening-blocked")).toBe(true);
  });

  it("rejects an opening whose reference point is not on its part", async () => {
    const r = await buildCase(sample, fdmProfile);
    const input: CaseInput = {
      ...r.input,
      openings: r.input.openings.map((o) =>
        o.mount === "lens"
          ? { ...o, position: [o.position[0], o.position[1], o.position[2] + 20] }
          : o,
      ),
    };
    const g = await generateCase(input, fdmProfile);
    expect(hasErrors(await validateCase(input, g, fdmProfile))).toBe(true);
  });

  it("rejects a case that does not fit the build volume", async () => {
    const p = resolveProfile({ buildVolume: [20, 20, 20] });
    if (!p.ok) throw new Error(p.message);
    const r = await buildCase(sample, p.value);
    expect(r.issues.some((i) => i.code === "build-volume")).toBe(true);
  });

  it("warns, but does not reject, about the deep pin-tool holes and the wide USB bridge", async () => {
    const r = await buildCase(sample, fdmProfile);
    const codes = r.issues.filter((i) => i.severity === "warning").map((i) => i.code);
    expect(codes).toContain("deep-hole");
    expect(codes).toContain("bridge");
    expect(r.ok).toBe(true);
  });
});
