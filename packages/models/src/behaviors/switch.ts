import { defineBehavior, numberOf } from "@physisim/core";

export interface SwitchState {
  readonly closed: boolean;
}

/** 이벤트: `{ type: "press" }`, `{ type: "release" }`. 래칭 스위치는 press마다 상태가 뒤집히고 release는 무시한다. */
export const switchBehavior = defineBehavior<SwitchState>({
  id: "behavior.switch",
  init: () => ({ closed: false }),
  onEvent: (s, event, ctx) => {
    const latching = ctx.config.latching === true;
    const closed =
      event.type === "press"
        ? latching
          ? !s.closed
          : true
        : event.type === "release" && !latching
          ? false
          : s.closed;
    return { state: { closed }, outputs: { closed } };
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
  step: (s) => ({ state: s, outputs: { closed: s.closed } }),
});
