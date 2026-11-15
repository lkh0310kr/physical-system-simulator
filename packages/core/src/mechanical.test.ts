import { describe, expect, it } from "vitest";
import {
  BodySchema,
  bodySize,
  LengthSchema,
  MountSchema,
  PlacementSchema,
  placementPosition,
  toMeters,
} from "./mechanical.ts";
import { ModelSchema } from "./model.ts";
import { parseSystem } from "./system.ts";

describe("lengths", () => {
  it("reads numbers as millimeters and quantities in any length unit", () => {
    expect(toMeters(25.5)).toBeCloseTo(0.0255);
    expect(toMeters("2cm")).toBeCloseTo(0.02);
    expect(toMeters("19.75mm")).toBeCloseTo(0.01975);
  });

  it("rejects non-length quantities", () => {
    expect(LengthSchema.safeParse("5V").success).toBe(false);
    expect(LengthSchema.safeParse("far").success).toBe(false);
    expect(LengthSchema.safeParse(Number.NaN).success).toBe(false);
  });
});

describe("body / mount / placement", () => {
  it("converts a body and a placement to SI", () => {
    const body = BodySchema.parse({ size: [19.75, 26.02, "3.8mm"], mass: 4.65 });
    const close = (actual: readonly number[], expected: readonly number[]) => {
      for (const [i, e] of expected.entries()) expect(actual[i]).toBeCloseTo(e, 9);
    };
    close(bodySize(body), [0.01975, 0.02602, 0.0038]);
    close(placementPosition(PlacementSchema.parse({ position: [10, "2cm", 0] })), [0.01, 0.02, 0]);
  });

  it("rejects unknown fields and malformed mounts", () => {
    expect(BodySchema.safeParse({ size: [1, 2, 3], weight: 1 }).success).toBe(false);
    expect(MountSchema.safeParse({ name: "Lens", position: [0, 0, 0] }).success).toBe(false);
  });
});

describe("model and system integration", () => {
  it("accepts a model with a body and unique mounts", () => {
    const base = { id: "model.cell", name: "Cell", category: "x", body: { size: [20, 26, 3.8] } };
    expect(
      ModelSchema.safeParse({ ...base, mounts: [{ name: "a", position: [0, 0, 0] }] }).success,
    ).toBe(true);
    const dup = ModelSchema.safeParse({
      ...base,
      mounts: [
        { name: "a", position: [0, 0, 0] },
        { name: "a", position: [1, 0, 0] },
      ],
    });
    expect(dup.success).toBe(false);
  });

  it("keeps assembly optional and only places declared instances", () => {
    const sys = (assembly?: unknown) =>
      parseSystem({
        name: "s",
        instances: [{ id: "a", model: "model.x" }],
        ...(assembly ? { assembly } : {}),
      });
    expect(sys().ok).toBe(true);
    expect(sys({ a: { position: [0, 0, 0] } }).ok).toBe(true);
    const bad = sys({ ghost: { position: [0, 0, 0] } });
    expect(!bad.ok && bad.issues[0]?.path).toBe("assembly.ghost");
  });
});
