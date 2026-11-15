import { readFileSync } from "node:fs";
import { loadSystemProject } from "@physisim/core";
import { createStandardRegistry } from "@physisim/models";
import { describe, expect, it } from "vitest";
import { runLoaded } from "./simulate.ts";

function load(
  edit?: (json: { instances: { id: string; properties?: Record<string, unknown> }[] }) => void,
) {
  const json = JSON.parse(readFileSync("examples/robot-arm.system.json", "utf8"));
  edit?.(json);
  const r = loadSystemProject(json, () => undefined, createStandardRegistry);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

const trace = (seconds: number, edit?: Parameters<typeof load>[0]) =>
  runLoaded(load(edit), { duration: seconds, dt: 0.001, presses: [] }, new Map()).trace;

/** 시각 t 직전까지의 마지막 값. */
const at = (t: ReturnType<typeof trace>, signal: string, time: number) => {
  let v: unknown;
  for (const e of t.entries) {
    if (e.signal === signal && e.time <= time) v = e.value;
  }
  return Number(v);
};

describe("robot arm: IK → 5 servos → frame forward kinematics (A4)", () => {
  const t = trace(4);

  it("the gripper tip settles on both target points: forward kinematics of the servo angles matches the commanded XYZ", () => {
    // 목표: t < 2 s → (0.15, +0.07, 0.09), 2 s ≤ t < 4 s → (0.15, −0.07, 0.03)
    for (const [time, y, z] of [
      [1.9, 0.07, 0.09],
      [3.9, -0.07, 0.03],
    ] as const) {
      expect(at(t, "arm.tipX", time)).toBeCloseTo(0.15, 2);
      expect(at(t, "arm.tipY", time)).toBeCloseTo(y, 2);
      expect(at(t, "arm.tipZ", time)).toBeCloseTo(z, 2);
    }
  });

  it("the arm takes time to move: servo speed limits mean the tip has not arrived 50 ms after the target jumps", () => {
    const early = Math.abs(at(t, "arm.tipY", 2.05) - -0.07);
    expect(early).toBeGreaterThan(0.01);
  });

  it("all targets are reachable and the commands stay within the servo range", () => {
    expect(t.final["ik.reachable"]).toBe(true);
    for (const k of ["ik.base", "ik.shoulder", "ik.elbow", "ik.wrist"]) {
      expect(Math.abs(Number(t.final[k]))).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
    }
  });

  it("with the big servos underpowered (3 V, below the MG996R's 4.8 V minimum) the shoulder and elbow do not move", () => {
    const weak = trace(2, (j) => {
      const psu = j.instances.find((i) => i.id === "psu");
      if (psu) psu.properties = { voltage: 3 };
    });
    expect(Number(weak.final["s2.angle"])).toBe(0);
    expect(Number(weak.final["s3.angle"])).toBe(0);
  });

  it("flags an unreachable target instead of pretending", () => {
    const far = trace(1, (j) => {
      const tx = j.instances.find((i) => i.id === "tx");
      if (tx) tx.properties = { waveform: "square", amplitude: 0, frequency: 0.25, offset: 0.5 };
    });
    expect(far.final["ik.reachable"]).toBe(false);
  });
});
