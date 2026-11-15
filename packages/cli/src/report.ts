/**
 * 카메라 노드 시나리오 분석 (M4): 시뮬레이션 trace에서 촬영 1회당 지연·에너지와 배터리 수명을 뽑는다.
 * 노드는 `<node>.phase`·`<node>.sent`·`<node>.current`, 배터리는 `<battery>.charge`·`<battery>.energy`를 출력해야 한다.
 */
import type { Trace } from "@physisim/engine";
import type { Press } from "./simulate.ts";

export interface CaptureStats {
  /** 버튼으로 깨어난 시각 [s]. */
  readonly wakeAt: number;
  /** 이미지를 전송 완료한 시각 [s] (수신 기록). */
  readonly deliveredAt: number;
  /** 깨어남 → 전송 완료 [s]. */
  readonly latency: number;
  /** 이 촬영 동안 배터리에서 나간 전하 [mAh]. */
  readonly chargeMah: number;
  /** 이 촬영 동안 배터리에서 나간 에너지 [J]. */
  readonly energyJ: number;
}

export interface CameraReport {
  readonly captures: readonly CaptureStats[];
  /** 절전 중 배터리 전류 [µA]. */
  readonly sleepMicroamps: number;
  /** 촬영 1회 평균 지연 [s]. */
  readonly meanLatency: number;
  /** 촬영 1회 평균 에너지 [mAh]. */
  readonly meanChargeMah: number;
}

export interface Names {
  readonly node: string;
  readonly battery: string;
}

const mah = (coulombs: number) => coulombs / 3.6;

/** `signal`이 `time` 이전(포함)에 마지막으로 가진 값. 기록이 없으면 `fallback`. */
function valueAt(trace: Trace, signal: string, time: number, fallback: number): number {
  let value = fallback;
  for (const e of trace.entries) {
    if (e.time > time) break;
    if (e.signal === signal && typeof e.value === "number") value = e.value;
  }
  return value;
}

export function analyzeCaptures(trace: Trace, names: Names): CameraReport {
  const phase = `${names.node}.phase`;
  const sent = `${names.node}.sent`;
  const wakes = trace.entries.filter((e) => e.signal === phase && e.value === "boot");
  const deliveries = trace.entries.filter((e) => e.signal === sent && Number(e.value) > 0);

  const captures: CaptureStats[] = wakes.flatMap((wake, i) => {
    const done = deliveries[i];
    if (!done) return []; // 시뮬레이션이 끝날 때까지 전송을 못 마친 촬영은 세지 않는다
    const charge = (t: number) => valueAt(trace, `${names.battery}.charge`, t, 0);
    const energy = (t: number) => valueAt(trace, `${names.battery}.energy`, t, 0);
    return [
      {
        wakeAt: wake.time,
        deliveredAt: done.time,
        latency: done.time - wake.time,
        chargeMah: mah(charge(done.time) - charge(wake.time)),
        energyJ: energy(done.time) - energy(wake.time),
      },
    ];
  });

  const sleep = trace.entries.find((e) => e.signal === `${names.node}.current`);
  const mean = (f: (c: CaptureStats) => number) =>
    captures.length ? captures.reduce((a, c) => a + f(c), 0) / captures.length : 0;
  return {
    captures,
    sleepMicroamps: typeof sleep?.value === "number" ? sleep.value * 1e6 : 0,
    meanLatency: mean((c) => c.latency),
    meanChargeMah: mean((c) => c.chargeMah),
  };
}

/**
 * 하루 `perDay`장 촬영할 때 배터리 수명 [일]. 촬영 에너지 + 나머지 시간의 절전 전류.
 * 절전 전류는 노드 쪽 값이라 배터리 쪽 환산은 호출자가 이미 한 trace 값을 쓴다.
 */
export function batteryLifeDays(report: CameraReport, capacityMah: number, perDay: number): number {
  const sleepMahPerDay = (report.sleepMicroamps / 1000) * 24;
  const perDayMah = perDay * report.meanChargeMah + sleepMahPerDay;
  return perDayMah > 0 ? capacityMah / perDayMah : Number.POSITIVE_INFINITY;
}

/** `"btn@1s"`, `"btn@1s+500ms"` → 누르는 일정. 형식이 틀리면 Error. */
export function parsePress(text: string, toSeconds: (t: string) => number): Press {
  const m = /^([a-z][a-z0-9_-]*)@([^+]+)(?:\+(.+))?$/.exec(text);
  if (!m)
    throw new Error(
      `--press 형식: <instance>@<시각>[+<누른 시간>] (예: btn@1s, btn@1s+500ms), 받은 값: "${text}"`,
    );
  return { instance: m[1] ?? "", at: toSeconds(m[2] ?? ""), hold: m[3] ? toSeconds(m[3]) : 0.2 };
}

/** 사람이 읽는 리포트. */
export function formatReport(
  report: CameraReport,
  capacityMah: number,
  perDay: readonly number[],
): string {
  const ms = (s: number) => `${(s * 1000).toFixed(0)} ms`;
  const lines = [`촬영 ${report.captures.length}회`];
  for (const [i, c] of report.captures.entries()) {
    lines.push(
      `  #${i + 1}  ${c.wakeAt.toFixed(3)} s 깨어남 → ${c.deliveredAt.toFixed(3)} s 전송 완료 · 지연 ${ms(c.latency)} · ${c.chargeMah.toFixed(4)} mAh · ${c.energyJ.toFixed(3)} J`,
    );
  }
  if (report.captures.length === 0) return `${lines[0]} — 전송을 마친 촬영이 없다`;
  lines.push("", `평균 지연      ${ms(report.meanLatency)}`);
  lines.push(`촬영 1회       ${report.meanChargeMah.toFixed(4)} mAh`);
  lines.push(`절전 전류      ${report.sleepMicroamps.toFixed(1)} µA`);
  lines.push("", `배터리 ${capacityMah} mAh 수명 (하루 촬영 횟수별)`);
  for (const n of perDay) {
    const days = batteryLifeDays(report, capacityMah, n);
    lines.push(
      `  하루 ${String(n).padStart(4)}장  →  ${days >= 100 ? days.toFixed(0) : days.toFixed(1)} 일`,
    );
  }
  return lines.join("\n");
}
