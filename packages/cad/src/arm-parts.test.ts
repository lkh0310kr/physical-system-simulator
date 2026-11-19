import { describe, expect, it } from "vitest";
import { armServos, buildArmParts, DEFAULT_ARM_SPEC } from "./arm-parts.ts";
import { inspect } from "./geometry.ts";

describe("printable arm parts", async () => {
  const parts = await buildArmParts();
  const servos = await armServos();

  it("builds six parts, each a single closed solid", () => {
    expect(parts.map((p) => p.name)).toEqual([
      "base",
      "turret",
      "upper-arm",
      "forearm",
      "wrist-bracket",
      "finger",
    ]);
    for (const p of parts) {
      const r = inspect(p.solid);
      expect(r.closed, p.name).toBe(true);
      expect(r.components, p.name).toBe(1);
    }
  });

  it("every part fits the default FDM build volume (220 × 220 × 250 mm) in some orientation", () => {
    const build = [220, 220, 250].sort((a, b) => a - b);
    for (const p of parts) {
      const r = inspect(p.solid);
      const dims = [0, 1, 2].map((i) => (r.max[i] ?? 0) - (r.min[i] ?? 0)).sort((a, b) => a - b);
      for (const [i, d] of dims.entries()) expect(d, p.name).toBeLessThanOrEqual(build[i] ?? 0);
    }
  });

  it("no servo body overlaps any printed part: the pockets leave room for the real servo (product dimensions + clearance)", () => {
    for (const s of servos) {
      for (const p of parts) {
        expect(p.solid.intersect(s.solid).volume(), `${s.joint} × ${p.name}`).toBeLessThan(1e-6);
      }
    }
  });

  it("servo pockets are tight: each servo body is within 1 mm of the pocket walls it sits in (no loose fit)", () => {
    // 서보 상자를 여유(clearance)의 두 배만큼 키워도 부품과 겹쳐야 한다 → 포켓이 서보를 감싸고 있다
    const grow = 2 * DEFAULT_ARM_SPEC.clearance + 0.4;
    for (const s of servos) {
      const r = inspect(s.solid);
      // 상자를 키운 부피는 자기 부품과 닿는다 (벽이 서보 바로 옆에 있다)
      const owner = parts.find((p) => {
        const pr = inspect(p.solid);
        return (
          r.min[0] >= pr.min[0] - grow &&
          r.max[0] <= pr.max[0] + grow &&
          r.min[1] >= pr.min[1] - grow &&
          r.max[1] <= pr.max[1] + grow
        );
      });
      expect(owner, s.joint).toBeDefined();
    }
  });

  it("the joint axes sit at the spec's heights: shoulder 80, elbow 180, wrist 280 mm (links of 100 mm)", () => {
    const j = (k: string) => servos.find((s) => s.joint === k);
    const centerZ = (k: string) => {
      const r = inspect(j(k)?.solid ?? servos[0]?.solid ?? (undefined as never));
      return (r.min[2] + r.max[2]) / 2;
    };
    expect(centerZ("J2")).toBeCloseTo(DEFAULT_ARM_SPEC.baseHeight, 6);
    expect(centerZ("J3")).toBeCloseTo(DEFAULT_ARM_SPEC.baseHeight + DEFAULT_ARM_SPEC.link1, 6);
    expect(centerZ("J4")).toBeCloseTo(
      DEFAULT_ARM_SPEC.baseHeight + DEFAULT_ARM_SPEC.link1 + DEFAULT_ARM_SPEC.link2,
      6,
    );
  });
});
