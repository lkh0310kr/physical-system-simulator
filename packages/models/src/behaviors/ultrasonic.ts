import { defineBehavior, numberOf } from "@physisim/core";

/**
 * 초음파 거리 센서: 센서에서 `heading` 방향으로 쏜 광선이 평면 벽(x = wallX)에 닿는 거리.
 * 측정 범위(2~450 cm), 1 mm 분해능을 적용한다. 전원(VCC ≥ 3 V)이 없으면 에코가 없는 것으로 최대 거리를 낸다.
 * 입력 신호 x, y, heading은 센서가 달린 차체의 자세(신호 선)다.
 */
export const ultrasonic = defineBehavior<Record<string, never>>({
  id: "behavior.ultrasonic",
  init: () => ({}),
  circuit: (_s, ctx) => [
    { kind: "load", id: "supply", port: "VCC", current: numberOf(ctx.properties, "supplyCurrent") },
  ],
  step: (state, inputs, ctx) => {
    const max = numberOf(ctx.properties, "maxRange");
    const min = numberOf(ctx.properties, "minRange");
    const powered = (ctx.circuit?.voltage("VCC") ?? 0) >= numberOf(ctx.properties, "minSupply");
    const x = Number(inputs.x ?? 0);
    const heading = Number(inputs.heading ?? 0);
    const c = Math.cos(heading);
    const sensorX = x + numberOf(ctx.properties, "mountOffset") * c;
    const wall = numberOf(ctx.properties, "wallX");
    // 벽을 향하고 있고(c > 0) 아직 벽 앞이면 거리, 아니면 에코 없음
    const raw = c > 1e-6 && wall >= sensorX ? (wall - sensorX) / c : Number.POSITIVE_INFINITY;
    const clipped = !powered ? max : Math.min(max, Math.max(min, raw));
    const distance = Math.round(clipped * 1000) / 1000; // 분해능 1 mm
    return { state, outputs: { distance } };
  },
});
