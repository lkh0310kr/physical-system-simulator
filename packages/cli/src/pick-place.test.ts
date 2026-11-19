import { readFileSync } from "node:fs";
import { loadSystemProject } from "@physisim/core";
import { createStandardRegistry } from "@physisim/models";
import { describe, expect, it } from "vitest";
import { runLoaded } from "./simulate.ts";

type Edit = (json: { instances: { id: string; properties?: Record<string, unknown> }[] }) => void;

function run(seconds: number, edit?: Edit) {
  const json = JSON.parse(readFileSync("examples/robot-arm-pick-place.system.json", "utf8"));
  edit?.(json);
  const r = loadSystemProject(json, () => undefined, createStandardRegistry);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return runLoaded(r.value, { duration: seconds, dt: 0.001, presses: [] }, new Map()).trace;
}

const valueAt = (t: ReturnType<typeof run>, signal: string, time: number) => {
  let v: unknown;
  for (const e of t.entries) if (e.signal === signal && e.time <= time) v = e.value;
  return v;
};

describe("robot arm pick & place (A5)", () => {
  const t = run(6);

  it("runs the eight steps in order and finishes", () => {
    const steps = t.entries.filter((e) => e.signal === "seq.step").map((e) => e.value);
    expect(steps).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(t.final["seq.done"]).toBe(true);
  });

  it("the cube follows the gripper while held: it is lifted above the table between grasp and release", () => {
    const grasped = t.entries.find((e) => e.signal === "seq.step" && e.value === 3)?.time ?? 0;
    const midCarry = grasped + 0.3;
    expect(valueAt(t, "cube.held", midCarry)).toBe(true);
    expect(Number(valueAt(t, "cube.z", midCarry))).toBeGreaterThan(0.02);
  });

  it("ends on the table at the place position: displacement equals place − pick", () => {
    expect(t.final["cube.held"]).toBe(false);
    expect(Number(t.final["cube.x"])).toBeCloseTo(0.12 - 0.15, 2);
    expect(Number(t.final["cube.y"])).toBeCloseTo(-0.08 - 0.07, 2);
    expect(Number(t.final["cube.z"])).toBeCloseTo(0, 3);
  });

  it("does not grab a cube that is not under the gripper", () => {
    const miss = run(6, (j) => {
      const cube = j.instances.find((i) => i.id === "cube");
      if (cube) cube.properties = { startX: 0.1, startY: -0.1 };
    });
    expect(miss.entries.some((e) => e.signal === "cube.held" && e.value === true)).toBe(false);
  });

  it("stalls at the first step when the big servos are underpowered, and the cube never moves", () => {
    const weak = run(3, (j) => {
      const psu = j.instances.find((i) => i.id === "psu");
      if (psu) psu.properties = { voltage: 3 };
    });
    expect(Number(weak.final["seq.step"])).toBe(0);
    expect(Number(weak.final["cube.x"])).toBe(0);
  });
});
