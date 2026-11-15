import { defineBehavior, numberOf } from "@physisim/core";
import { inverse, type JointWindows } from "../arm-kinematics.ts";

/**
 * 역기구학 블록: 목표 끝 위치(targetX/Y/Z)를 서보 명령(base, shoulder, elbow, wrist)으로 바꾼다.
 * 관절 각도 θ와 서보 명령의 관계는 `명령 = θ − 장착 오프셋`이고, 서보는 오프셋 ± 반(半)가동범위 안에서만 움직인다.
 * 닿지 않으면 가장 가까운 자세를 가동 범위로 잘라 내고 `reachable`을 false로 낸다.
 */
export const armIk = defineBehavior<Record<string, never>>({
  id: "behavior.arm-ik",
  init: () => ({}),
  step: (state, inputs, ctx) => {
    const p = (k: string) => numberOf(ctx.properties, k);
    const window = (offset: number, half: number): readonly [number, number] => [
      offset - half,
      offset + half,
    ];
    const windows: JointWindows = {
      base: [-p("baseHalfRange"), p("baseHalfRange")],
      shoulder: window(p("shoulderOffset"), p("shoulderHalfRange")),
      elbow: window(p("elbowOffset"), p("elbowHalfRange")),
      wrist: window(p("wristOffset"), p("wristHalfRange")),
    };
    const { angles, reachable } = inverse(
      {
        baseHeight: p("baseHeight"),
        link1: p("link1"),
        link2: p("link2"),
        gripper: p("gripperLength"),
      },
      {
        x: Number(inputs.targetX ?? 0.12),
        y: Number(inputs.targetY ?? 0),
        z: Number(inputs.targetZ ?? 0.1),
      },
      windows,
    );
    const command = (theta: number, offset: number, half: number) =>
      Math.min(half, Math.max(-half, theta - offset));
    return {
      state,
      outputs: {
        base: command(angles.base, 0, p("baseHalfRange")),
        shoulder: command(angles.shoulder, p("shoulderOffset"), p("shoulderHalfRange")),
        elbow: command(angles.elbow, p("elbowOffset"), p("elbowHalfRange")),
        wrist: command(angles.wrist, p("wristOffset"), p("wristHalfRange")),
        reachable,
      },
    };
  },
});
