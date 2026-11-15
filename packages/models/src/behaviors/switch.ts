import { defineBehavior, numberOf } from "@physisim/core";

export interface SwitchState {
  /** 접점이 닫혀 있는지. */
  readonly closed: boolean;
  /** 사람이 누르고 있는지 (래칭이면 켜짐 상태). */
  readonly pressed: boolean;
  /** 플런저 위치 0~1 (기구 동작을 켰을 때만 의미가 있다). */
  readonly plunger: number;
}

/** 놓을 때 접점이 열리는 지점은 작동 거리의 이 비율 (기계적 히스테리시스, 가정). */
const RELEASE_RATIO = 0.8;

/**
 * 이벤트: `{ type: "press" }`, `{ type: "release" }`. 래칭 스위치는 press마다 상태가 뒤집히고 release는 무시한다.
 * `travel`이 0(기본)이면 누르는 즉시 접점이 바뀐다. 0보다 크면 플런저가 `pressTime`에 걸쳐 움직이고
 * `operatingTravel`에서 닫히며, 놓을 때는 그 80% 지점에서 열린다 — 기구 상태가 회로를 구동한다.
 */
export const switchBehavior = defineBehavior<SwitchState>({
  id: "behavior.switch",
  init: () => ({ closed: false, pressed: false, plunger: 0 }),
  onEvent: (s, event, ctx) => {
    const latching = ctx.config.latching === true;
    const pressed =
      event.type === "press"
        ? latching
          ? !s.pressed
          : true
        : event.type === "release" && !latching
          ? false
          : s.pressed;
    const mechanical = numberOf(ctx.config, "travel") > 0;
    // 기구 동작이 없으면 접점이 즉시 바뀐다
    const closed = mechanical ? s.closed : pressed;
    const plunger = mechanical ? s.plunger : pressed ? 1 : 0;
    return { state: { closed, pressed, plunger }, outputs: { closed, plunger } };
  },
  circuit: (s, ctx) => [
    {
      kind: "resistor",
      id: "contact",
      a: "1",
      b: "2",
      resistance: numberOf(ctx.config, s.closed ? "closedResistance" : "openResistance"),
    },
  ],
  step: (s, _inputs, ctx) => {
    const travel = numberOf(ctx.config, "travel");
    if (travel <= 0) return { state: s, outputs: { closed: s.closed, plunger: s.plunger } };
    const speed = ctx.dt / Math.max(1e-6, numberOf(ctx.config, "pressTime"));
    const target = s.pressed ? 1 : 0;
    const plunger =
      target > s.plunger
        ? Math.min(target, s.plunger + speed)
        : Math.max(target, s.plunger - speed);
    const operate = numberOf(ctx.config, "operatingTravel") / travel;
    const closed = s.closed ? plunger >= operate * RELEASE_RATIO : plunger >= operate;
    return { state: { ...s, plunger, closed }, outputs: { closed, plunger } };
  },
});
