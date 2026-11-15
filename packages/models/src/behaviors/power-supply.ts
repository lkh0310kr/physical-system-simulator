import { defineBehavior, numberOf, type ResolvedValues } from "@physisim/core";

export interface Rail {
  readonly port: string;
  /** [V] */
  readonly voltage: number;
}

/** `"5V=5,3.3V=3.3"` → 레일 목록. 형식이 틀리면 RangeError (Model 정의의 오류). */
export function parseRails(text: string): Rail[] {
  return text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [port, volts, ...rest] = part.split("=");
      const voltage = Number(volts);
      if (!port || volts === undefined || rest.length > 0 || !Number.isFinite(voltage)) {
        throw new RangeError(`잘못된 레일 표기: "${part}" ("Port=전압"이어야 한다)`);
      }
      return { port: port.trim(), voltage };
    });
}

const railsOf = (config: ResolvedValues) => parseRails(String(config.rails ?? ""));

/** 각 레일을 작은 내부 저항의 구동원으로 내놓는다. 전원은 항상 켜져 있다. */
export const powerSupply = defineBehavior<Record<string, never>>({
  id: "behavior.power-supply",
  init: () => ({}),
  circuit: (_s, ctx) =>
    railsOf(ctx.config).map((r) => ({
      kind: "drive" as const,
      id: `rail.${r.port}`,
      port: r.port,
      voltage: r.voltage,
      resistance: numberOf(ctx.config, "outputResistance"),
    })),
  step: (s) => ({ state: s, outputs: {} }),
});
