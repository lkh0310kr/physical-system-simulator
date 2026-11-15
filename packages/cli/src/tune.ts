/**
 * 자동 탐색 (P8-T4): 속성 하나의 범위를 훑어, 제약을 지키면서 목표 신호가 가장 좋아지는 값을 찾는다.
 * 거친 격자 → 가장 좋은 점 주변을 다시 촘촘히 훑는 2단계. 평가는 스윕(`sweepSystem`)을 그대로 쓴다.
 * 에이전트가 "이 저항을 얼마로 해야 LED가 안 타면서 가장 밝나"를 한 번에 풀고, 근거 표와 함께 제안을 받는다.
 */
import type { Result } from "@physisim/core";
import type { RunOptions } from "./simulate.ts";
import { type SweepRow, type SweepStat, sweepSystem } from "./sweep.ts";

export interface TuneRange {
  readonly instance: string;
  readonly key: string;
  readonly lo: number;
  readonly hi: number;
}

/** `r1.resistance=50..2000` */
export function parseRange(text: string): Result<TuneRange> {
  const m = /^([a-z][a-z0-9_-]*)\.([A-Za-z][A-Za-z0-9_]*)=(-?[\d.eE+-]+)\.\.(-?[\d.eE+-]+)$/.exec(
    text,
  );
  const lo = Number(m?.[3]);
  const hi = Number(m?.[4]);
  if (!m || !Number.isFinite(lo) || !Number.isFinite(hi) || lo >= hi) {
    return {
      ok: false,
      issues: [
        {
          path: "--range",
          message: `"instance.속성=최소..최대" (최소<최대) 형식이어야 한다: ${text}`,
        },
      ],
    };
  }
  return { ok: true, value: { instance: m[1] ?? "", key: m[2] ?? "", lo, hi } };
}

export interface Constraint {
  readonly signal: string;
  readonly op: "<=" | ">=" | "=";
  /** 숫자 또는 true/false. */
  readonly value: number | boolean;
}

/** `led1.burnt=false`, `r1.current<=0.02`, `led1.brightness>=0.3` */
export function parseConstraint(text: string): Result<Constraint> {
  const m = /^([A-Za-z][\w.-]*?)(<=|>=|=)(.+)$/.exec(text);
  if (!m) {
    return {
      ok: false,
      issues: [
        {
          path: "--require",
          message: `"신호<=값", "신호>=값", "신호=값" 형식이어야 한다: ${text}`,
        },
      ],
    };
  }
  const raw = (m[3] ?? "").trim();
  const value = raw === "true" ? true : raw === "false" ? false : Number(raw);
  if (typeof value === "number" && !Number.isFinite(value)) {
    return { ok: false, issues: [{ path: "--require", message: `값을 읽을 수 없다: ${raw}` }] };
  }
  return { ok: true, value: { signal: m[1] ?? "", op: m[2] as Constraint["op"], value } };
}

/** 제약 평가에 쓰는 통계: 불리언·등호는 최종값, 상한(<=)은 최댓값, 하한(>=)은 최솟값. */
export function satisfies(c: Constraint, stat: SweepStat | undefined): boolean {
  if (!stat) return false;
  if (c.op === "=") return stat.final === c.value;
  if (typeof c.value !== "number") return false;
  if (c.op === "<=") return stat.max !== undefined && stat.max <= c.value;
  return stat.min !== undefined && stat.min >= c.value;
}

/** lo~hi를 `n`개로. 범위가 한 자릿수 넘게 넓고 양수면 로그 간격, 아니면 등간격. */
export function gridOf(lo: number, hi: number, n: number): number[] {
  const log = lo > 0 && hi / lo >= 10;
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return log ? lo * (hi / lo) ** t : lo + (hi - lo) * t;
  });
}

export interface TuneGoal {
  readonly signal: string;
  readonly direction: "max" | "min";
  /** 목표 신호에서 읽을 통계 (기본: 최댓값/최솟값 방향에 맞춤). */
  readonly stat?: "final" | "max" | "min";
}

export interface TuneCandidate {
  readonly value: number;
  readonly objective: number | undefined;
  readonly feasible: boolean;
  readonly row: SweepRow;
}

export interface TuneResult {
  readonly best: TuneCandidate | undefined;
  readonly evaluated: readonly TuneCandidate[];
}

const round = (v: number) => Number(v.toPrecision(5));

export async function tuneSystem(
  file: string,
  range: TuneRange,
  goal: TuneGoal,
  constraints: readonly Constraint[],
  options: RunOptions,
  points = 12,
): Promise<Result<TuneResult>> {
  const stat = goal.stat ?? (goal.direction === "max" ? "max" : "min");
  const watch = [...new Set([goal.signal, ...constraints.map((c) => c.signal)])];
  const evaluate = async (values: number[]): Promise<Result<TuneCandidate[]>> => {
    const r = await sweepSystem(
      file,
      [{ instance: range.instance, key: range.key, values: values.map((v) => String(round(v))) }],
      watch,
      options,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: r.value.map((row, i) => {
        const o = row.stats[goal.signal]?.[stat];
        const objective = typeof o === "number" ? o : undefined;
        return {
          value: values[i] ?? 0,
          objective,
          feasible: constraints.every((c) => satisfies(c, row.stats[c.signal])),
          row,
        };
      }),
    };
  };
  const better = (a: TuneCandidate, b: TuneCandidate | undefined) =>
    a.feasible &&
    a.objective !== undefined &&
    (!b ||
      b.objective === undefined ||
      (goal.direction === "max" ? a.objective > b.objective : a.objective < b.objective));
  const pick = (list: readonly TuneCandidate[]) =>
    list.reduce<TuneCandidate | undefined>((b, c) => (better(c, b) ? c : b), undefined);

  const coarseValues = gridOf(range.lo, range.hi, points);
  const coarse = await evaluate(coarseValues);
  if (!coarse.ok) return coarse;
  const bestCoarse = pick(coarse.value);
  if (!bestCoarse) return { ok: true, value: { best: undefined, evaluated: coarse.value } };
  // 가장 좋은 점의 이웃 사이를 촘촘히 다시 훑는다
  const i = coarse.value.indexOf(bestCoarse);
  const lo = coarseValues[Math.max(0, i - 1)] ?? range.lo;
  const hi = coarseValues[Math.min(coarseValues.length - 1, i + 1)] ?? range.hi;
  const fine = await evaluate(gridOf(lo, hi, points));
  if (!fine.ok) return fine;
  const seen = new Set<number>();
  const all = [...coarse.value, ...fine.value]
    .sort((a, b) => a.value - b.value)
    .filter((c) => !seen.has(round(c.value)) && seen.add(round(c.value)));
  return { ok: true, value: { best: pick(all), evaluated: all } };
}

export function formatTune(range: TuneRange, goal: TuneGoal, r: TuneResult): string {
  const name = `${range.instance}.${range.key}`;
  const lines = [
    `탐색: ${name} ∈ [${range.lo}, ${range.hi}], 목표 ${goal.direction === "max" ? "최대화" : "최소화"} ${goal.signal}`,
    "",
  ];
  if (!r.best) {
    lines.push("✗ 제약을 만족하는 값이 범위 안에 없다 — 범위를 넓히거나 제약을 완화한다");
  } else {
    lines.push(
      `✓ 제안: ${name} = ${round(r.best.value)}  (${goal.signal} = ${round(r.best.objective ?? 0)})`,
    );
  }
  lines.push("", "평가한 값 (제약 만족 여부):");
  for (const c of r.evaluated) {
    lines.push(
      `  ${String(round(c.value)).padEnd(10)} ${c.feasible ? "○" : "×"}  ${c.objective === undefined ? "—" : round(c.objective)}`,
    );
  }
  return lines.join("\n");
}
