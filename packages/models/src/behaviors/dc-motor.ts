import { defineBehavior, numberOf } from "@physisim/core";

interface MotorState {
  /** 축 누적 각도 [rad]. */
  readonly angle: number;
}

/**
 * 브러시 DC 모터 (출력축 기준 등가 모델).
 *   전기: A–B 사이 권선 저항 R, 역기전력 e = ke·ω → I = (V − e)/R (노턴 등가: 저항 ∥ 전류원 −e/R)
 *   기계: 토크 τ = kt·I, 관성 J, 점성 마찰 b (무부하 손실)
 * ke와 kt가 다른 것은 기어박스 손실을 토크 상수에 흡수했기 때문이다 (Model 설명 참조).
 */
export const dcMotor = defineBehavior<MotorState>({
  id: "behavior.dc-motor",
  init: () => ({ angle: 0 }),
  circuit: (_s, ctx) => {
    const r = numberOf(ctx.properties, "resistance");
    const e = numberOf(ctx.properties, "emfConstant") * (ctx.mechanical?.omega("shaft") ?? 0);
    return [
      { kind: "resistor", id: "winding", a: "A", b: "B", resistance: r },
      { kind: "source", id: "emf", a: "A", b: "B", current: -e / r },
    ];
  },
  mechanics: (_s, ctx) => {
    const current = (ctx.circuit?.current("winding") ?? 0) + (ctx.circuit?.current("emf") ?? 0);
    return [
      {
        kind: "rotor",
        id: "rotor",
        port: "shaft",
        torque: numberOf(ctx.properties, "torqueConstant") * current,
        inertia: numberOf(ctx.properties, "inertia"),
        damping: numberOf(ctx.properties, "friction"),
      },
    ];
  },
  step: (s, _inputs, ctx) => {
    const omega = ctx.mechanical?.omega("shaft") ?? 0;
    const current = (ctx.circuit?.current("winding") ?? 0) + (ctx.circuit?.current("emf") ?? 0);
    const angle = s.angle + omega * ctx.dt;
    return {
      state: { angle },
      outputs: {
        omega,
        current,
        torque: numberOf(ctx.properties, "torqueConstant") * current,
        angle,
      },
    };
  },
});
