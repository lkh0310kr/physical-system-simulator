import { defineBehavior, numberOf } from "@physisim/core";
import { inverse } from "../arm-kinematics.ts";

/** 역기구학 블록: 목표 끝 위치(targetX/Y/Z)를 관절 각도 명령(base, shoulder, elbow, wrist)으로 바꾼다. 닿지 않으면 한계로 잘라 낸다. */
export const armIk = defineBehavior<Record<string, never>>({
  id: "behavior.arm-ik",
  init: () => ({}),
  step: (state, inputs, ctx) => {
    const limit = numberOf(ctx.properties, "jointLimit");
    const { angles, reachable } = inverse(
      {
        baseHeight: numberOf(ctx.properties, "baseHeight"),
        link1: numberOf(ctx.properties, "link1"),
        link2: numberOf(ctx.properties, "link2"),
        gripper: numberOf(ctx.properties, "gripperLength"),
      },
      {
        x: Number(inputs.targetX ?? 0.12),
        y: Number(inputs.targetY ?? 0),
        z: Number(inputs.targetZ ?? 0.1),
      },
      limit,
    );
    const clamp = (a: number) => Math.min(limit, Math.max(-limit, a));
    return {
      state,
      outputs: {
        base: clamp(angles.base),
        shoulder: clamp(angles.shoulder),
        elbow: clamp(angles.elbow),
        wrist: clamp(angles.wrist),
        reachable,
      },
    };
  },
});
