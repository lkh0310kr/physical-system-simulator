/**
 * 파라미터 스윕 (P8-T3): Instance 속성 값을 바꿔 가며 같은 시뮬레이션을 반복하고, 관찰 신호의 최종·최소·최대를 표로 비교한다.
 * 에이전트가 "저항을 어떻게 고르면 LED가 안 타고 충분히 밝은가" 같은 질문을 한 번의 호출로 푸는 용도다.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { type Issue, loadSystemProject, type Result } from "@physisim/core";
import { createStandardRegistry } from "@physisim/models";
import { compileFirmware, type RunOptions, runLoaded } from "./simulate.ts";

export interface SweepAxis {
  readonly instance: string;
  readonly key: string;
  readonly values: readonly string[];
}

export interface SweepStat {
  readonly final: number | string | boolean | undefined;
  readonly min: number | undefined;
  readonly max: number | undefined;
}

export interface SweepRow {
  /** "instance.key" → 이 실행에 쓴 값. */
  readonly settings: Readonly<Record<string, string>>;
  readonly stats: Readonly<Record<string, SweepStat>>;
}

/** `r1.resistance=100,220,470` → 축. 값은 단위 문자열(`"220Ω"`)도 된다. */
export function parseAxis(text: string): Result<SweepAxis> {
  const m = /^([a-z][a-z0-9_-]*)\.([A-Za-z][A-Za-z0-9_]*)=(.+)$/.exec(text);
  if (!m) {
    return {
      ok: false,
      issues: [{ path: "--set", message: `"instance.속성=값1,값2,…" 형식이어야 한다: ${text}` }],
    };
  }
  const values = (m[3] ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return values.length
    ? { ok: true, value: { instance: m[1] ?? "", key: m[2] ?? "", values } }
    : { ok: false, issues: [{ path: "--set", message: `값이 비었다: ${text}` }] };
}

/** 축들의 모든 조합 (데카르트 곱). */
export function combinations(axes: readonly SweepAxis[]): Record<string, string>[] {
  return axes.reduce<Record<string, string>[]>(
    (acc, axis) =>
      acc.flatMap((row) =>
        axis.values.map((v) => ({ ...row, [`${axis.instance}.${axis.key}`]: v })),
      ),
    [{}],
  );
}

/** 숫자처럼 보이는 문자열은 숫자로, 아니면(`"220Ω"`) 문자열 그대로 속성에 넣는다. */
const asValue = (v: string): number | string =>
  /^-?\d+(\.\d+)?(e-?\d+)?$/i.test(v) ? Number(v) : v;

export async function sweepSystem(
  file: string,
  axes: readonly SweepAxis[],
  watch: readonly string[],
  options: RunOptions,
): Promise<Result<SweepRow[]>> {
  let base: { instances?: { id: string; properties?: Record<string, unknown> }[] };
  try {
    base = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    return { ok: false, issues: [{ path: file, message: (e as Error).message }] };
  }
  const read = (rel: string) => {
    try {
      return readFileSync(resolve(dirname(file), rel), "utf8");
    } catch {
      return undefined;
    }
  };
  const rows: SweepRow[] = [];
  let firmware: Awaited<ReturnType<typeof compileFirmware>> | undefined;
  for (const settings of combinations(axes)) {
    const json = structuredClone(base);
    const issues: Issue[] = [];
    for (const [target, value] of Object.entries(settings)) {
      const [instance, key] = target.split(".") as [string, string];
      const inst = json.instances?.find((i) => i.id === instance);
      if (!inst) {
        issues.push({ path: target, message: `없는 Instance: ${instance}` });
        continue;
      }
      inst.properties = { ...inst.properties, [key]: asValue(value) };
    }
    if (issues.length) return { ok: false, issues };
    const loaded = loadSystemProject(json, read, createStandardRegistry);
    if (!loaded.ok) {
      return {
        ok: false,
        issues: loaded.issues.map((i) => ({ ...i, path: `${JSON.stringify(settings)} ${i.path}` })),
      };
    }
    // 펌웨어는 속성과 무관하므로 처음 한 번만 컴파일한다
    firmware ??= await compileFirmware(loaded.value);
    if (!firmware.ok) return { ok: false, issues: firmware.issues };
    const run = runLoaded(loaded.value, options, firmware.value);
    const stats: Record<string, SweepStat> = {};
    for (const signal of watch) {
      const nums = run.trace.entries
        .filter((e) => e.signal === signal && typeof e.value === "number")
        .map((e) => e.value as number);
      stats[signal] = {
        final: run.trace.final[signal],
        min: nums.length ? Math.min(...nums) : undefined,
        max: nums.length ? Math.max(...nums) : undefined,
      };
    }
    rows.push({ settings, stats });
  }
  return { ok: true, value: rows };
}

const width = (s: string) =>
  [...s].reduce((w, c) => w + ((c.codePointAt(0) ?? 0) > 0x2e80 ? 2 : 1), 0);
const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - width(s)));
const fmt = (v: number | string | boolean | undefined) =>
  v === undefined ? "—" : typeof v === "number" ? Number(v.toPrecision(4)).toString() : String(v);

export function formatSweep(rows: readonly SweepRow[], watch: readonly string[]): string {
  if (rows.length === 0) return "(결과 없음)";
  const keys = Object.keys(rows[0]?.settings ?? {});
  const header = [...keys, ...watch.flatMap((w) => [`${w} 최종`, `${w} 최대`])];
  const body = rows.map((r) => [
    ...keys.map((k) => r.settings[k] ?? ""),
    ...watch.flatMap((w) => [fmt(r.stats[w]?.final), fmt(r.stats[w]?.max)]),
  ]);
  const widths = header.map((h, i) => Math.max(width(h), ...body.map((b) => width(b[i] ?? ""))));
  const line = (cells: string[]) => cells.map((c, i) => pad(c, widths[i] ?? 0)).join("  ");
  return [line(header), ...body.map(line)].join("\n");
}
