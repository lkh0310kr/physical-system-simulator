/** 같은 조건(버튼 일정)에서 여러 시스템을 돌려 지표를 나란히 비교한다 (M5). */
import type { Issue, Result } from "@physisim/core";
import { analyzeCaptures, batteryLifeDays, type CameraReport, capacityMah } from "./report.ts";
import { compileFirmware, loadSystemFile, type RunOptions, runLoaded } from "./simulate.ts";

export interface ComparisonRow {
  readonly file: string;
  readonly name: string;
  readonly report: CameraReport;
  readonly capacityMah: number;
  /** 노드 Model이 가정으로 남겨 둔 항목 (docs/scenarios/*-specs.md 참조). */
  readonly assumptions: readonly string[];
}

export async function compareSystems(
  files: readonly string[],
  options: RunOptions,
  nodeId: string,
  batteryId: string,
  _perDay: number,
): Promise<Result<ComparisonRow[]>> {
  const rows: ComparisonRow[] = [];
  const issues: Issue[] = [];
  for (const file of files) {
    const loaded = loadSystemFile(file);
    if (!loaded.ok) {
      issues.push(...loaded.issues.map((i) => ({ ...i, path: `${file}: ${i.path}` })));
      continue;
    }
    const firmware = await compileFirmware(loaded.value);
    if (!firmware.ok) {
      issues.push(...firmware.issues);
      continue;
    }
    const result = runLoaded(loaded.value, options, firmware.value);
    const node = loaded.value.doc.instances.find((i) => i.id === nodeId);
    const meta = loaded.value.registry.getModel(node?.model ?? "")?.metadata;
    const assumptions = Array.isArray(meta?.assumptions) ? (meta.assumptions as string[]) : [];
    rows.push({
      file,
      name: loaded.value.doc.name,
      report: analyzeCaptures(result.trace, { node: nodeId, battery: batteryId }),
      capacityMah: capacityMah(loaded.value, batteryId),
      assumptions,
    });
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: rows };
}

/** 표시 너비: 한글·전각은 2칸. */
const width = (s: string) =>
  [...s].reduce((w, c) => w + ((c.codePointAt(0) ?? 0) > 0x2e80 ? 2 : 1), 0);
const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - width(s)));

export function formatComparison(rows: readonly ComparisonRow[], perDay: number): string {
  const cols = rows.map((r) => ({
    title: r.name.replace(/^Wearable Camera — /, ""),
    latency: r.report.captures.length ? `${(r.report.meanLatency * 1000).toFixed(0)} ms` : "—",
    mah: r.report.captures.length ? r.report.meanChargeMah.toFixed(4) : "—",
    sleep: `${r.report.sleepMicroamps.toFixed(1)} µA`,
    life: r.report.captures.length
      ? `${(() => {
          const d = batteryLifeDays(r.report, r.capacityMah, perDay);
          return d >= 100 ? d.toFixed(0) : d.toFixed(1);
        })()} 일`
      : "—",
    assumptions: `${r.assumptions.length}개`,
  }));
  const label = [
    "",
    "전송 완료까지(지연)",
    "촬영 1회 [mAh]",
    "절전 전류",
    `수명 (하루 ${perDay}장)`,
    "미확인 가정",
  ];
  const w0 = Math.max(...label.map(width));
  const lines = [
    `${pad(label[0] ?? "", w0)}  ${cols.map((c) => pad(c.title, 30)).join("")}`,
    ...[
      ["latency", 1],
      ["mah", 2],
      ["sleep", 3],
      ["life", 4],
      ["assumptions", 5],
    ].map(
      ([k, i]) =>
        `${pad(label[i as number] ?? "", w0)}  ${cols.map((c) => pad(String(c[k as keyof typeof c]), 30)).join("")}`,
    ),
    "",
  ];
  for (const r of rows) {
    if (r.assumptions.length)
      lines.push(`${r.name.replace(/^Wearable Camera — /, "")} 가정: ${r.assumptions.join(", ")}`);
  }
  return lines.join("\n");
}
