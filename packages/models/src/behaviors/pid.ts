import { defineBehavior, numberOf } from "@physisim/core";

interface PidState {
  readonly integral: number;
  readonly previous: number | undefined;
  readonly ise: number;
}

/**
 * 이산 PID. 미분은 오차가 아니라 측정값에 건다(목표가 바뀔 때 튀는 "킥" 방지).
 * 출력이 한계에 걸린 채 오차가 같은 방향이면 적분을 멈춘다 (적분 와인드업 방지).
 * 신호 `setpoint`가 연결되지 않으면 속성 `target`을 목표로 쓴다. 신호 선이 한 스텝 늦으므로 측정은 직전 스텝 값이다.
 */
export const pid = defineBehavior<PidState>({
  id: "behavior.pid",
  init: () => ({ integral: 0, previous: undefined, ise: 0 }),
  step: (s, inputs, ctx) => {
    const kp = numberOf(ctx.properties, "kp");
    const ki = numberOf(ctx.properties, "ki");
    const kd = numberOf(ctx.properties, "kd");
    const lo = numberOf(ctx.properties, "outMin");
    const hi = numberOf(ctx.properties, "outMax");
    const setpoint =
      typeof inputs.setpoint === "number" ? inputs.setpoint : numberOf(ctx.properties, "target");
    const measured = typeof inputs.measurement === "number" ? inputs.measurement : undefined;
    // 측정이 아직 없으면(첫 스텝) 아무것도 하지 않는다
    if (measured === undefined) {
      return { state: s, outputs: { output: 0, error: 0, ise: s.ise } };
    }
    const error = setpoint - measured;
    const derivative =
      s.previous === undefined || ctx.dt <= 0 ? 0 : -(measured - s.previous) / ctx.dt;
    const candidate = s.integral + error * ctx.dt;
    const unclamped = kp * error + ki * candidate + kd * derivative;
    const output = Math.min(hi, Math.max(lo, unclamped));
    const saturated = unclamped !== output;
    // 포화 중 오차가 포화를 더 깊게 하는 방향이면 적분을 갱신하지 않는다
    const integral =
      saturated && Math.sign(error) === Math.sign(unclamped) ? s.integral : candidate;
    const ise = s.ise + error * error * ctx.dt;
    return { state: { integral, previous: measured, ise }, outputs: { output, error, ise } };
  },
});
