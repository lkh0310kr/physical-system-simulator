import { describe, expect, it } from "vitest";
import { type ArmGeometry, forward, inverse } from "./arm-kinematics.ts";

const g: ArmGeometry = { baseHeight: 0.08, link1: 0.1, link2: 0.1, gripper: 0.06 };

describe("arm kinematics", () => {
  it("at all-zero angles the arm points straight up and the gripper points forward", () => {
    const tip = forward(g, { base: 0, shoulder: 0, elbow: 0, wrist: 0 });
    // 위팔·아래팔 수직 0.08 + 0.1 + 0.1, 그리퍼는 앞(+x)으로 0.06
    expect(tip.x).toBeCloseTo(0.06, 9);
    expect(tip.z).toBeCloseTo(0.28, 9);
  });

  it("forward kinematics of inverse kinematics returns the target within 0.1 mm for reachable points", () => {
    for (const [x, y, z] of [
      [0.15, 0, 0.02],
      [0.12, 0.08, 0.03],
      [0.1, -0.1, 0.05],
      [0.14, 0.05, 0.1],
    ] as const) {
      const r = inverse(g, { x, y, z });
      expect(r.reachable).toBe(true);
      const tip = forward(g, r.angles);
      expect(Math.hypot(tip.x - x, tip.y - y, tip.z - z)).toBeLessThan(1e-4);
    }
  });

  it("keeps the gripper pointing straight down at the target (direction angle π)", () => {
    const r = inverse(g, { x: 0.15, y: 0, z: 0.02 });
    const phi = r.angles.shoulder + r.angles.elbow + r.angles.wrist + Math.PI / 2;
    expect(phi).toBeCloseTo(Math.PI, 9);
  });

  it("reports a target beyond the reach as unreachable", () => {
    expect(inverse(g, { x: 0.45, y: 0, z: 0.02 }).reachable).toBe(false);
  });

  it("reports a target that needs a joint beyond the servo limit as unreachable", () => {
    // 매우 가깝고 낮은 점: 팔꿈치를 ±90° 이상 굽혀야 한다
    expect(inverse(g, { x: 0.03, y: 0, z: 0.0 }).reachable).toBe(false);
  });

  it("the base yaw follows the target direction", () => {
    expect(inverse(g, { x: 0, y: 0.15, z: 0.02 }).angles.base).toBeCloseTo(Math.PI / 2, 9);
  });
});
