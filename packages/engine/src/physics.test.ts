import { beforeAll, describe, expect, it } from "vitest";
import { createPlanarWorld, initPhysics } from "./physics.ts";

beforeAll(async () => {
  await initPhysics();
});

const wall = { position: [1.01, 0, 0] as const, size: [0.02, 2, 0.2] as const, rotationZ: 0 };
const car = {
  position: [0, 0, 0] as const,
  size: [0.2, 0.18, 0.06] as const,
  rotationZ: 0,
  mass: 0.5,
};

function drive(seconds: number, command: { speed: number; yawRate: number }, statics = [wall]) {
  const world = createPlanarWorld(statics);
  const h = world.addBody(car);
  for (let i = 0; i < seconds * 1000; i++) world.step(0.001, new Map([[h, command]]));
  const pose = world.pose(h);
  world.free();
  return pose;
}

describe("planar physics (P7-T7)", () => {
  it("moves a body at the commanded speed when nothing is in the way", () => {
    const p = drive(1, { speed: 0.5, yawRate: 0 });
    expect(p.x).toBeCloseTo(0.5, 2);
    expect(Math.abs(p.y)).toBeLessThan(1e-6);
  });

  it("stops a body against a static wall: its front face meets the wall face (x ≈ 1.0 − half length)", () => {
    const p = drive(3, { speed: 0.5, yawRate: 0 });
    expect(p.x).toBeGreaterThan(0.88);
    expect(p.x).toBeLessThan(0.91);
  });

  it("turns in place at the commanded yaw rate and keeps a continuous heading past ±π", () => {
    const p = drive(2, { speed: 0, yawRate: 2 }, []);
    expect(p.heading).toBeCloseTo(4, 1); // 4 rad > π: 감기지 않는다
    expect(Math.hypot(p.x, p.y)).toBeLessThan(1e-3);
  });

  it("gives identical results on every run (deterministic)", () => {
    const a = drive(1, { speed: 0.4, yawRate: 0.7 });
    const b = drive(1, { speed: 0.4, yawRate: 0.7 });
    expect(a).toEqual(b);
  });
});
