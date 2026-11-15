import { defineBehavior, numberOf } from "@physisim/core";
import { forward } from "../arm-kinematics.ts";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * 로봇팔 프레임: 서보 각도 신호(j1~j5)를 3D 표시용 출력으로 내보내고, 순기구학으로 그리퍼 끝 위치를 계산한다.
 * 그리퍼 서보 각도는 `gripClosedAngle`을 1(완전히 닫힘)로 하는 `grip`(0~1)으로 바꾼다.
 */
export const armFrame = defineBehavior<Record<string, never>>({
  id: "behavior.arm-frame",
  init: () => ({}),
  step: (state, inputs, ctx) => {
    const num = (k: string) => Number(inputs[k] ?? 0);
    const q = { base: num("j1"), shoulder: num("j2"), elbow: num("j3"), wrist: num("j4") };
    const tip = forward(
      {
        baseHeight: numberOf(ctx.properties, "baseHeight"),
        link1: numberOf(ctx.properties, "link1"),
        link2: numberOf(ctx.properties, "link2"),
        gripper: numberOf(ctx.properties, "gripperLength"),
      },
      q,
    );
    const grip = clamp01(num("j5") / numberOf(ctx.properties, "gripClosedAngle"));
    return {
      state,
      outputs: {
        j1: q.base,
        j2: q.shoulder,
        j3: q.elbow,
        j4: q.wrist,
        grip,
        tipX: tip.x,
        tipY: tip.y,
        tipZ: tip.z,
      },
    };
  },
});
