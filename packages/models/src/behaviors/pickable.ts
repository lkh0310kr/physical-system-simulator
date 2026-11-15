import { defineBehavior, numberOf } from "@physisim/core";

interface PickState {
  readonly held: boolean;
  /** 지금 월드 위치 [m]. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * 잡을 수 있는 물체: 그리퍼 끝(tipX/Y/Z)이 물체 가까이(`reach`)에 있고 `grip`이 `closeAt` 이상이면 잡혀서 끝점을 따라온다.
 * `grip`이 `openAt` 아래로 내려가면 놓아서 바닥(물체 중심 높이 = 절반 크기)으로 떨어진다. 접촉 물리는 없다(단순 부착).
 * 출력 x·y·z는 시작 위치 기준 변위 — 3D 조립 위치에 더해져 움직이는 것으로 보인다.
 */
export const pickable = defineBehavior<PickState>({
  id: "behavior.pickable",
  init: (ctx) => ({
    held: false,
    x: numberOf(ctx.properties, "startX"),
    y: numberOf(ctx.properties, "startY"),
    z: numberOf(ctx.properties, "size") / 2,
  }),
  step: (s, inputs, ctx) => {
    const size = numberOf(ctx.properties, "size");
    const grip = Number(inputs.grip ?? 0);
    const tip = {
      x: Number(inputs.tipX ?? Number.NaN),
      y: Number(inputs.tipY ?? Number.NaN),
      z: Number(inputs.tipZ ?? Number.NaN),
    };
    const reach = numberOf(ctx.properties, "reach");
    const close = Math.hypot(tip.x - s.x, tip.y - s.y, tip.z - s.z) <= reach;
    const held = s.held
      ? grip >= numberOf(ctx.properties, "openAt")
      : close && grip >= numberOf(ctx.properties, "closeAt");
    // 잡힌 동안은 끝점에, 놓이면 그 자리 바닥으로
    const next = held
      ? { x: tip.x, y: tip.y, z: tip.z }
      : s.held
        ? { x: s.x, y: s.y, z: size / 2 }
        : { x: s.x, y: s.y, z: s.z };
    const startX = numberOf(ctx.properties, "startX");
    const startY = numberOf(ctx.properties, "startY");
    return {
      state: { held, ...next },
      outputs: { x: next.x - startX, y: next.y - startY, z: next.z - size / 2, held },
    };
  },
});
