import { describe, expect, it } from "vitest";
import { analyzeFit, overlapVolume, worldBox } from "./fit.ts";

const box = (
  id: string,
  size: [number, number, number],
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
) => ({ id, size, position, rotation }) as const;

describe("worldBox", () => {
  it("is size/2 around the center without rotation", () => {
    const b = worldBox(box("a", [4, 2, 1], [10, 0, 0]));
    expect(b.min).toEqual([8, -1, -0.5]);
    expect(b.max).toEqual([12, 1, 0.5]);
  });

  it("swaps x and y extents for a 90° turn about z", () => {
    const b = worldBox(box("a", [4, 2, 1], [0, 0, 0], [0, 0, 90]));
    expect(b.max[0]).toBeCloseTo(1);
    expect(b.max[1]).toBeCloseTo(2);
  });

  it("wraps a 45° turn about z in the diagonal bounds", () => {
    const b = worldBox(box("a", [2, 2, 1], [0, 0, 0], [0, 0, 45]));
    expect(b.max[0]).toBeCloseTo(Math.SQRT2);
  });
});

describe("overlapVolume", () => {
  it("is the intersection volume, and zero when boxes only touch or are apart", () => {
    const a = worldBox(box("a", [2, 2, 2], [0, 0, 0]));
    expect(overlapVolume(a, worldBox(box("b", [2, 2, 2], [1, 0, 0])))).toBeCloseTo(4); // 1×2×2
    expect(overlapVolume(a, worldBox(box("c", [2, 2, 2], [2, 0, 0])))).toBe(0);
    expect(overlapVolume(a, worldBox(box("d", [2, 2, 2], [5, 0, 0])))).toBe(0);
  });
});

describe("analyzeFit", () => {
  it("reports overlapping pairs, the outer size, volume and footprint area", () => {
    const r = analyzeFit([
      box("a", [2, 2, 2], [0, 0, 0]),
      box("b", [2, 2, 2], [1, 0, 0]),
      box("c", [1, 1, 1], [10, 0, 0]),
    ]);
    expect(r.overlaps).toEqual([{ a: "a", b: "b", volume: expect.closeTo(4) }]);
    expect(r.size[0]).toBeCloseTo(11.5); // a: -1…1, c: 9.5…10.5 → -1…10.5
    expect(r.volume).toBeCloseTo(r.size[0] * r.size[1] * r.size[2]);
    expect(r.footprintArea).toBeCloseTo(4 + 4 + 1);
  });

  it("lists parts without dimensions instead of guessing, and handles an empty assembly", () => {
    const r = analyzeFit([{ id: "x", size: undefined, position: [0, 0, 0], rotation: [0, 0, 0] }]);
    expect(r.missing).toEqual(["x"]);
    expect(r.size).toEqual([0, 0, 0]);
  });
});
