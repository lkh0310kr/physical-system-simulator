/** 스코프용 신호 이력: 프레임마다 숫자 신호를 모아 최근 `window`초만 남긴다 (순수 함수). */
export interface ScopeSample {
  /** 시뮬레이션 시각 [s]. */
  readonly t: number;
  readonly v: number;
}

export type ScopeHistory = Readonly<Record<string, readonly ScopeSample[]>>;

/** 새 프레임을 이력에 더한다. 시간이 거꾸로 가면(리셋) 이력을 비운다. 숫자·불리언 신호만 기록(불리언은 0/1). */
export function pushFrame(
  history: ScopeHistory,
  time: number,
  signals: Readonly<Record<string, unknown>>,
  window = 5,
  maxSamples = 2000,
): ScopeHistory {
  const last = Object.values(history)[0]?.at(-1)?.t;
  const base: ScopeHistory = last !== undefined && time < last ? {} : history;
  const next: Record<string, readonly ScopeSample[]> = {};
  for (const [key, value] of Object.entries(signals)) {
    const v =
      typeof value === "number" ? value : typeof value === "boolean" ? Number(value) : undefined;
    if (v === undefined || !Number.isFinite(v)) continue;
    const kept = (base[key] ?? []).filter((s) => s.t >= time - window);
    kept.push({ t: time, v });
    next[key] = kept.length > maxSamples ? kept.slice(-maxSamples) : kept;
  }
  return next;
}

/** 폴리라인 점 목록으로: 가로는 최근 `window`초, 세로는 [lo, hi] (없으면 자동). */
export function toPoints(
  samples: readonly ScopeSample[],
  width: number,
  height: number,
  window = 5,
  range?: readonly [number, number],
): string {
  if (samples.length === 0) return "";
  const end = samples[samples.length - 1]?.t ?? 0;
  const vs = samples.map((s) => s.v);
  let lo = range?.[0] ?? Math.min(...vs);
  let hi = range?.[1] ?? Math.max(...vs);
  if (hi - lo < 1e-12) {
    lo -= 0.5;
    hi += 0.5;
  }
  return samples
    .map((s) => {
      const x = ((s.t - (end - window)) / window) * width;
      const y = height - ((s.v - lo) / (hi - lo)) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
