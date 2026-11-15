import { defineBehavior, numberOf } from "@physisim/core";

export interface BatteryState {
  /** 지금까지 나간 전하 [C]. 충전되면 줄어든다. */
  readonly charge: number;
  /** 지금까지 나간 에너지 [J]. */
  readonly energy: number;
}

/** 충전 상태 0~1. initialSoc에서 시작해 나간 전하만큼 줄어든다. */
function socOf(s: BatteryState, props: Parameters<typeof numberOf>[0]): number {
  const capacity = numberOf(props, "capacity"); // [C]
  const soc = numberOf(props, "initialSoc") - (capacity > 0 ? s.charge / capacity : 0);
  return Math.min(1, Math.max(0, soc));
}

/**
 * 개방 전압은 SOC에 선형(emptyVoltage → fullVoltage), 내부 저항을 거쳐 단자에 건다.
 * 방전 전류는 회로 해석 결과로 읽어 전하·에너지를 적분한다 (스텝마다 전류를 dt 동안 일정하다고 본다).
 */
export const battery = defineBehavior<BatteryState>({
  id: "behavior.battery",
  init: () => ({ charge: 0, energy: 0 }),
  circuit: (s, ctx) => {
    const soc = socOf(s, ctx.properties);
    const empty = numberOf(ctx.properties, "emptyVoltage");
    const full = numberOf(ctx.properties, "fullVoltage");
    return [
      {
        kind: "drive",
        id: "cell",
        port: "+",
        voltage: empty + (full - empty) * soc,
        resistance: Math.max(1e-6, numberOf(ctx.properties, "internalResistance")),
      },
    ];
  },
  step: (s, _inputs, ctx) => {
    const current = ctx.circuit?.current("cell") ?? 0;
    const voltage = ctx.circuit?.voltage("+") ?? 0;
    const next = {
      charge: s.charge + current * ctx.dt,
      energy: s.energy + voltage * current * ctx.dt,
    };
    return {
      state: next,
      outputs: {
        voltage,
        current,
        soc: socOf(next, ctx.properties),
        charge: next.charge,
        energy: next.energy,
      },
    };
  },
});
