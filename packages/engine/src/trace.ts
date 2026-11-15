/**
 * Trace: 시뮬레이션 중 Behavior 출력의 변화 기록. 바뀐 값만 남겨 작고, 순수 JSON이다.
 * 신호 이름은 `<instance>.<출력 이름>` (예: "led1.brightness", "uno.D13").
 */
import type { PropertyValue } from "@physisim/core";
import type { Simulation } from "./simulation.ts";

export interface TraceEntry {
  /** 시각 [s]. */
  readonly time: number;
  readonly signal: string;
  readonly value: PropertyValue;
}

export interface Trace {
  readonly entries: readonly TraceEntry[];
  /** 마지막 스텝의 모든 신호 값. */
  readonly final: Readonly<Record<string, PropertyValue>>;
  readonly steps: number;
}

export interface TraceOptions {
  /** 숫자 변화를 무시할 상대 허용 오차. 기본 1e-9. */
  readonly tolerance?: number;
}

function changed(a: PropertyValue | undefined, b: PropertyValue, tolerance: number): boolean {
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) > tolerance * Math.max(1, Math.abs(a), Math.abs(b));
  }
  return a !== b;
}

/** 지금부터 출력 변화를 기록한다. `stop()`으로 구독을 끝내고 결과를 받는다. */
export function recordTrace(sim: Simulation, options: TraceOptions = {}) {
  const tolerance = options.tolerance ?? 1e-9;
  const entries: TraceEntry[] = [];
  const current: Record<string, PropertyValue> = {};
  let steps = 0;

  const unsubscribe = sim.onStep(({ time, outputs }) => {
    steps++;
    for (const [instance, byCapability] of outputs) {
      for (const signals of byCapability.values()) {
        for (const [key, value] of Object.entries(signals)) {
          const signal = `${instance}.${key}`;
          if (changed(current[signal], value, tolerance)) entries.push({ time, signal, value });
          current[signal] = value;
        }
      }
    }
  });

  const snapshot = (): Trace => ({ entries: [...entries], final: { ...current }, steps });
  return {
    snapshot,
    stop(): Trace {
      unsubscribe();
      return snapshot();
    },
  };
}
