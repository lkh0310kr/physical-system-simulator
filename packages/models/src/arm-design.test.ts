import { describe, expect, it } from "vitest";
import {
  coverage,
  DERATE,
  MG996R,
  RECOMMENDED,
  recommend,
  recommendedWindows,
  torques,
} from "./arm-design.ts";

const geometry = {
  baseHeight: RECOMMENDED.design.baseHeight,
  link1: RECOMMENDED.design.link1,
  link2: RECOMMENDED.design.link2,
  gripper: RECOMMENDED.design.gripper,
};

describe("arm design analysis", () => {
  it("the recommended design covers the whole required workspace with the recommended mount offsets", () => {
    expect(
      coverage(geometry, recommendedWindows(), RECOMMENDED.workspace, 8),
    ).toBeGreaterThanOrEqual(0.999);
  });

  it("without the mount offsets (servos centred on the arm's zero pose) the same arm cannot reach the workspace", () => {
    const centred = {
      base: [-Math.PI / 2, Math.PI / 2],
      shoulder: [-MG996R.range / 2, MG996R.range / 2],
      elbow: [-MG996R.range / 2, MG996R.range / 2],
      wrist: [-Math.PI / 2, Math.PI / 2],
    } as const;
    expect(coverage(geometry, centred, RECOMMENDED.workspace, 6)).toBeLessThan(0.5);
  });

  it("holds the 50 g payload at full stretch with at least 1.5x margin even at half the MG996R stall torque", () => {
    const t = torques(RECOMMENDED.design);
    expect(t.shoulder).toBeLessThan(MG996R.stallTorque * DERATE);
    expect(t.shoulderDerated).toBeGreaterThan(1.5);
    expect(t.elbowDerated).toBeGreaterThan(t.shoulderDerated);
  });

  it("a heavier payload shrinks the margin; at 250 g the shoulder would be overloaded", () => {
    const heavy = torques({ ...RECOMMENDED.design, payload: 0.25 });
    expect(heavy.shoulderDerated).toBeLessThan(1);
  });

  it("the search recommends 100 mm links: the shortest that covers the workspace, which also has the largest torque margin", () => {
    const r = recommend(RECOMMENDED.workspace, RECOMMENDED.design.payload);
    expect(r.best?.design.link1).toBe(0.1);
    expect(r.candidates.find((c) => c.design.link1 === 0.09)?.coverage).toBeLessThan(0.999);
    expect(r.best?.offsets.elbow).toBeCloseTo(RECOMMENDED.offsets.elbow, 6);
  });
});
