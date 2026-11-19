import { defineBehavior, numberOf } from "@physisim/core";

interface SeqState {
  /** 현재 단계 0~8 (8 = 끝). */
  readonly step: number;
  /** 이 단계에서 목표 근처에 머문 시간 [s]. */
  readonly settled: number;
}

/**
 * 집어서 옮기는 시퀀서. 이동 단계는 끝점(tipX/Y/Z 입력)이 허용 오차(`tolerance`) 안에서 `dwell` 동안 머물면 다음으로,
 * 잡기·놓기 단계는 그 자리에서 `graspTime` 동안 그리퍼를 닫거나 연 뒤 다음으로 간다.
 *  0 집을 곳 위로 · 1 내려가기 · 2 잡기 · 3 들어올리기 · 4 놓을 곳 위로 · 5 내려가기 · 6 놓기 · 7 올리기 · 8 끝
 */
export const pickPlace = defineBehavior<SeqState>({
  id: "behavior.pick-place",
  init: () => ({ step: 0, settled: 0 }),
  step: (s, inputs, ctx) => {
    const p = (k: string) => numberOf(ctx.properties, k);
    const hover = p("hoverHeight");
    const pick = [p("pickX"), p("pickY"), p("pickZ")] as const;
    const place = [p("placeX"), p("placeY"), p("placeZ")] as const;
    const at = (xyz: readonly number[], lift = 0) =>
      [xyz[0] ?? 0, xyz[1] ?? 0, (xyz[2] ?? 0) + lift] as const;
    const steps: { target: readonly number[]; grip: boolean; hold: boolean }[] = [
      { target: at(pick, hover), grip: false, hold: false },
      { target: at(pick), grip: false, hold: false },
      { target: at(pick), grip: true, hold: true },
      { target: at(pick, hover), grip: true, hold: false },
      { target: at(place, hover), grip: true, hold: false },
      { target: at(place), grip: true, hold: false },
      { target: at(place), grip: false, hold: true },
      { target: at(place, hover), grip: false, hold: false },
    ];
    const current = steps[Math.min(s.step, steps.length - 1)];
    if (!current) throw new Error("시퀀스가 비었다");
    const done = s.step >= steps.length;
    const tip = [
      Number(inputs.tipX ?? Number.NaN),
      Number(inputs.tipY ?? Number.NaN),
      Number(inputs.tipZ ?? Number.NaN),
    ];
    const near = tip.every((v, i) => Math.abs(v - (current.target[i] ?? 0)) <= p("tolerance"));
    // 잡기·놓기는 그 자리에서 시간이 차야, 이동은 도착해서 머물러야 다음 단계
    const ready = current.hold ? true : near;
    const settled = done ? 0 : ready ? s.settled + ctx.dt : 0;
    const needed = current.hold ? p("graspTime") : p("dwell");
    const advance = !done && settled >= needed;
    const step = advance ? s.step + 1 : s.step;
    const shown = steps[Math.min(step, steps.length - 1)] ?? current;
    return {
      state: { step, settled: advance ? 0 : settled },
      outputs: {
        targetX: shown.target[0] ?? 0,
        targetY: shown.target[1] ?? 0,
        targetZ: shown.target[2] ?? 0,
        gripCommand: shown.grip ? p("gripClosed") : 0,
        step,
        done: step >= steps.length,
      },
    };
  },
});
