import { defineBehavior, numberOf } from "@physisim/core";

interface PoseState {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  /** 바퀴 누적 각도 [rad] (표시용). */
  readonly leftAngle: number;
  readonly rightAngle: number;
}

/**
 * 2륜 차동 구동 차체. 두 바퀴 축(left, right)에 회전체를 얹고, 바퀴 속도로 위치·방향을 적분한다.
 * 관성: 차체 질량이 직진할 때 바퀴 축에 비치는 값은 바퀴마다 m·r²/2 (두 바퀴가 나눠 가짐) + 바퀴 자체 관성.
 * 마찰: 구름 저항을 점성 계수로 단순화했다. 선회 관성(요 관성)은 무시한다.
 * 바퀴가 +ω이면 앞으로 간다.
 */
export const driveBase = defineBehavior<PoseState>({
  id: "behavior.drive-base",
  init: () => ({ x: 0, y: 0, heading: 0, leftAngle: 0, rightAngle: 0 }),
  mechanics: (_s, ctx) => {
    const r = numberOf(ctx.properties, "wheelRadius");
    const inertia =
      (numberOf(ctx.properties, "mass") * r * r) / 2 + numberOf(ctx.properties, "wheelInertia");
    const damping = numberOf(ctx.properties, "rollingDamping");
    return ["left", "right"].map((port) => ({
      kind: "rotor" as const,
      id: `wheel-${port}`,
      port,
      torque: 0,
      inertia,
      damping,
    }));
  },
  step: (s, _inputs, ctx) => {
    const r = numberOf(ctx.properties, "wheelRadius");
    const width = numberOf(ctx.properties, "trackWidth");
    const wl = ctx.mechanical?.omega("left") ?? 0;
    const wr = ctx.mechanical?.omega("right") ?? 0;
    const speed = (r * (wl + wr)) / 2;
    const yawRate = (r * (wr - wl)) / width;
    // 스텝 중간 방향으로 위치를 적분 (직선 근사보다 호에 가깝다)
    const mid = s.heading + (yawRate * ctx.dt) / 2;
    const next = {
      x: s.x + speed * Math.cos(mid) * ctx.dt,
      y: s.y + speed * Math.sin(mid) * ctx.dt,
      heading: s.heading + yawRate * ctx.dt,
      leftAngle: s.leftAngle + wl * ctx.dt,
      rightAngle: s.rightAngle + wr * ctx.dt,
    };
    return { state: next, outputs: { ...next, speed, yawRate } };
  },
});
