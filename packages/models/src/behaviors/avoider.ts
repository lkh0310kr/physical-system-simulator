import { defineBehavior, numberOf } from "@physisim/core";

interface AvoidState {
  /** 피하는 동작이 앞으로 남은 시간 [s]. */
  readonly turnLeft: number;
}

/**
 * 반응형 장애물 회피 제어기: 평소에는 `cruise`로 직진하고, 거리가 `threshold`보다 가까워지면
 * `turnTime` 동안 제자리 회전(`turnCmd`)한 뒤 다시 직진한다. 신호 선으로 받은 `distance`를 쓴다.
 */
export const avoider = defineBehavior<AvoidState>({
  id: "behavior.avoider",
  init: () => ({ turnLeft: 0 }),
  step: (s, inputs, ctx) => {
    const distance = Number(inputs.distance ?? Number.POSITIVE_INFINITY);
    const near = distance < numberOf(ctx.properties, "threshold");
    const turnLeft =
      s.turnLeft > 0
        ? Math.max(0, s.turnLeft - ctx.dt)
        : near
          ? numberOf(ctx.properties, "turnTime")
          : 0;
    const turning = turnLeft > 0;
    const cruise = numberOf(ctx.properties, "cruise");
    const turn = numberOf(ctx.properties, "turnCmd");
    return {
      state: { turnLeft },
      // 제자리 왼쪽 회전: 왼쪽 바퀴 후진, 오른쪽 바퀴 전진
      outputs: { left: turning ? -turn : cruise, right: turning ? turn : cruise, turning },
    };
  },
});
