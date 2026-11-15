/** `physisim case`: System → 검증된 케이스 STL/3MF + BOM. 검증에 실패하면 아무것도 쓰지 않는다. */
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  bomCsv,
  bomOf,
  buildCase,
  type CaseIssue,
  formatBom,
  inspect,
  type ProcessProfile,
  printLayout,
  write3mf,
  writeStl,
} from "@physisim/cad";
import type { LoadedSystem } from "@physisim/core";

export interface CaseOutput {
  readonly ok: boolean;
  readonly issues: readonly CaseIssue[];
  /** 쓴 파일 경로 (실패하면 비어 있다). */
  readonly files: readonly string[];
  readonly summary: string;
}

const mm = (a: readonly number[], b: readonly number[]) =>
  [0, 1, 2].map((i) => ((b[i] ?? 0) - (a[i] ?? 0)).toFixed(1)).join(" × ");

export async function writeCase(
  loaded: LoadedSystem,
  profile: ProcessProfile,
  outDir: string,
  systemFile: string,
): Promise<CaseOutput> {
  const result = await buildCase(loaded, profile);
  const { geometry: g } = result;
  const stats = {
    base: inspect(g.base),
    lid: inspect(g.lid),
  };
  const bom = bomOf(
    loaded,
    [
      { name: "케이스 베이스", volumeMm3: stats.base.volume },
      { name: "케이스 뚜껑", volumeMm3: stats.lid.volume },
    ],
    profile,
  );
  const lines = [
    `케이스 (${profile.name})`,
    `  바깥 크기 ${mm(g.outer.min, g.outer.max)} mm, 공동 ${mm(g.cavity.min, g.cavity.max)} mm`,
    `  개구부 ${result.input.openings.map((o) => `${o.part}.${o.mount}`).join(", ") || "없음"}`,
    "",
    formatBom(bom, profile),
  ];
  const problems = result.issues.map(
    (i) => `  ${i.severity === "error" ? "✗" : "!"} [${i.code}] ${i.message}`,
  );
  if (problems.length) lines.push("", "검증", ...problems);
  if (!result.ok) {
    lines.push("", "✗ 검증 실패 — 파일을 쓰지 않았다");
    return { ok: false, issues: result.issues, files: [], summary: lines.join("\n") };
  }
  const name = basename(systemFile).replace(/\.system\.json$|\.json$/, "");
  mkdirSync(outDir, { recursive: true });
  const print = printLayout(g);
  const files: [string, Uint8Array | string][] = [
    [`${name}-base.stl`, writeStl(print.base, `${name} base`)],
    [`${name}-lid.stl`, writeStl(print.lid, `${name} lid (print orientation)`)],
    [
      `${name}-case.3mf`,
      write3mf([
        { name: "base", mesh: print.base },
        { name: "lid", mesh: print.lid },
      ]),
    ],
    [`${name}-bom.csv`, bomCsv(bom)],
  ];
  const written = files.map(([f, data]) => {
    const path = join(outDir, f);
    writeFileSync(path, data);
    return path;
  });
  lines.push("", "✓ 검증 통과 (경고는 위 목록 확인)", ...written.map((p) => `  ${p}`));
  return { ok: true, issues: result.issues, files: written, summary: lines.join("\n") };
}
