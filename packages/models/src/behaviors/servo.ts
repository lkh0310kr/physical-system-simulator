import { defineBehavior, numberOf } from "@physisim/core";

interface ServoState {
  readonly angle: number;
  /** 직전 스텝에 움직였는지 (회로의 전류 선택에 쓴다). */
  readonly moving: boolean;
}

/**
 * 서보: 명령 각도(`command`, rad)를 `range`(총 가동 각도)로 제한해 따라간다. 속도는 `speed`(rad/s)를 넘지 않는다.
 * 전원(VCC)이 `minSupply` 아래면 움직이지 않는다. 움직이는 동안 `movingCurrent`, 멈춰 있으면 `idleCurrent`를 쓴다.
 * 명령 신호가 없으면 현재 각도를 유지한다.
 */
export const servo = defineBehavior<ServoState>({
  id: "behavior.servo",
  init: () => ({ angle: 0, moving: false }),
  circuit: (s, ctx) => [
    {
      kind: "load",
      id: "supply",
      port: "VCC",
      current: numberOf(ctx.properties, s.moving ? "movingCurrent" : "idleCurrent"),
    },
  ],
  step: (s, inputs, ctx) => {
    const half = numberOf(ctx.properties, "range") / 2;
    const target = Math.min(half, Math.max(-half, Number(inputs.command ?? s.angle)));
    const powered = (ctx.circuit?.voltage("VCC") ?? 0) >= numberOf(ctx.properties, "minSupply");
    const maxStep = numberOf(ctx.properties, "speed") * ctx.dt;
    const delta = target - s.angle;
    const angle = powered
      ? s.angle + Math.sign(delta) * Math.min(Math.abs(delta), maxStep)
      : s.angle;
    const moving = powered && angle !== target;
    return { state: { angle, moving }, outputs: { angle, moving } };
  },
});
