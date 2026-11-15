#!/usr/bin/env node
/** physisim CLI. 사용법은 USAGE 참고. */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { resolveProfile } from "@physisim/cad";
import { formatIssues, parseQuantity, type Registry } from "@physisim/core";
import { createStandardRegistry } from "@physisim/models";
import { writeCase } from "./case.ts";
import { describeModel, searchModels } from "./catalog.ts";
import { checkModelFile, formatReview } from "./check-model.ts";
import { compareSystems, formatComparison } from "./compare.ts";
import { formatTime, formatValue, unitOf } from "./format.ts";
import { analyzeCaptures, capacityMah, formatReport, parsePress } from "./report.ts";
import {
  compileFirmware,
  type Loaded,
  loadSystemFile,
  type RunResult,
  runLoaded,
} from "./simulate.ts";
import { formatSweep, parseAxis, sweepSystem } from "./sweep.ts";
import { formatTune, parseConstraint, parseRange, tuneSystem } from "./tune.ts";
import { watchSystem } from "./watch.ts";

const USAGE = `사용법:
  physisim models [검색어] [--system <system.json>] [--json]   부품 찾기
  physisim validate <system.json>                              검증
  physisim run <system.json> [--duration 2s] [--dt 1ms] [--json] [--limit 40]
  physisim report <system.json> --press btn@1s [--duration 4s] [--node node] [--battery bat] [--per-day 10,100]
  physisim compare <a.json> <b.json> ... --press btn@1s [--duration 4s] [--per-day 100]   같은 조건에서 비교
  physisim case <system.json> [--process fdm] [--profile <profile.json>] [--out out] [--meshes <dir>]   케이스 STL/3MF + BOM (검증 통과 시에만 파일 생성)
  physisim sweep <system.json> --set r1.resistance=100,220,470 [--set …] --watch led1.brightness,r1.current [--duration 1s]   속성 값을 바꿔 가며 비교
  physisim tune <system.json> --range r1.resistance=50..2000 --maximize led1.brightness --require led1.burnt=false [--require r1.current<=0.02] [--stat final|max|min]   제약을 지키는 최적값 찾기
  physisim check <model-or-capability.json>                    새 부품 정의 검증 + 사람이 확인할 항목 (파일은 안 고침)
  physisim watch <system.json> [run 옵션]                       파일이 바뀔 때마다 다시 실행`;

function seconds(text: string, name: string): number {
  const q = parseQuantity(text);
  if (q.unit.dimension.some((d, i) => d !== (i === 2 ? 1 : 0)))
    throw new Error(`--${name}은 시간이어야 한다 (예: 2s, 500ms)`);
  return q.value;
}

async function main(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      duration: { type: "string", default: "2s" },
      dt: { type: "string", default: "1ms" },
      json: { type: "boolean", default: false },
      limit: { type: "string", default: "40" },
      system: { type: "string" },
      press: { type: "string", multiple: true },
      set: { type: "string", multiple: true },
      range: { type: "string" },
      stat: { type: "string" },
      maximize: { type: "string" },
      minimize: { type: "string" },
      require: { type: "string", multiple: true },
      watch: { type: "string" },
      node: { type: "string", default: "node" },
      battery: { type: "string", default: "bat" },
      "per-day": { type: "string", default: "10,100,1000" },
      process: { type: "string", default: "fdm" },
      profile: { type: "string" },
      out: { type: "string", default: "out" },
      meshes: { type: "string", default: "apps/web/public/meshes" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, file] = positionals;
  if (command === "models" && !values.help) return models(file, values.system, values.json);
  if (
    values.help ||
    !command ||
    !file ||
    !["validate", "run", "watch", "report", "compare", "case", "sweep", "tune", "check"].includes(
      command,
    )
  ) {
    console.log(USAGE);
    return values.help ? 0 : 2;
  }

  const duration = seconds(values.duration, "duration");
  const dt = seconds(values.dt, "dt");
  const limit = Number(values.limit);

  if (command === "watch") {
    watchSystem(file, { duration, dt }, (r) => {
      console.clear();
      console.log(
        `[${new Date().toLocaleTimeString()}] ${file} — 변경을 감시 중 (Ctrl+C로 종료)\n`,
      );
      if (!r.ok) console.error(`✗ 검증 실패\n${formatIssues(r.issues)}`);
      else printRun(r.loaded, r.run, duration, values.json, limit);
    });
    return 0;
  }

  if (command === "compare") {
    const files = positionals.slice(1);
    const presses = (values.press ?? []).map((p) => parsePress(p, (t) => seconds(t, "press")));
    const perDay = Number(values["per-day"].split(",")[0]);
    const rows = await compareSystems(
      files,
      { duration, dt, presses },
      values.node,
      values.battery,
      perDay,
    );
    if (!rows.ok) {
      console.error(`✗ ${formatIssues(rows.issues)}`);
      return 1;
    }
    console.log(formatComparison(rows.value, perDay));
    return 0;
  }

  if (command === "check") {
    const review = checkModelFile(file);
    if (!review.ok) {
      console.error(`✗ ${formatIssues(review.issues)}`);
      return 1;
    }
    console.log(formatReview(review.value));
    return 0;
  }

  if (command === "tune") {
    const range = parseRange(values.range ?? "");
    const reqs = (values.require ?? []).map(parseConstraint);
    const bad = [range, ...reqs].flatMap((r) => (r.ok ? [] : r.issues));
    const signal = values.maximize ?? values.minimize;
    if (bad.length || !range.ok || !signal) {
      console.error(
        `✗ ${bad.length ? formatIssues(bad) : "--range 와 --maximize(또는 --minimize)가 필요하다"}`,
      );
      return 2;
    }
    const stat = ["final", "max", "min"].includes(values.stat ?? "")
      ? (values.stat as "final" | "max" | "min")
      : undefined;
    const goal = {
      signal,
      direction: values.maximize ? ("max" as const) : ("min" as const),
      ...(stat ? { stat } : {}),
    };
    const presses = (values.press ?? []).map((p) => parsePress(p, (t) => seconds(t, "press")));
    const result = await tuneSystem(
      file,
      range.value,
      goal,
      reqs.flatMap((r) => (r.ok ? [r.value] : [])),
      { duration, dt, presses },
    );
    if (!result.ok) {
      console.error(`✗ ${formatIssues(result.issues)}`);
      return 1;
    }
    console.log(formatTune(range.value, goal, result.value));
    return result.value.best ? 0 : 1;
  }

  if (command === "sweep") {
    const axes = (values.set ?? []).map(parseAxis);
    const bad = axes.flatMap((a) => (a.ok ? [] : a.issues));
    if (bad.length || axes.length === 0) {
      console.error(
        `✗ ${bad.length ? formatIssues(bad) : "--set 이 필요하다 (예: --set r1.resistance=100,220,470)"}`,
      );
      return 2;
    }
    const watch = (values.watch ?? "").split(",").filter(Boolean);
    if (watch.length === 0) {
      console.error("✗ --watch 가 필요하다 (예: --watch led1.brightness)");
      return 2;
    }
    const presses = (values.press ?? []).map((p) => parsePress(p, (t) => seconds(t, "press")));
    const result = await sweepSystem(
      file,
      axes.flatMap((a) => (a.ok ? [a.value] : [])),
      watch,
      { duration, dt, presses },
    );
    if (!result.ok) {
      console.error(`✗ ${formatIssues(result.issues)}`);
      return 1;
    }
    console.log(formatSweep(result.value, watch));
    return 0;
  }

  const loaded = loadSystemFile(file);
  if (!loaded.ok) {
    console.error(`✗ ${file}\n${formatIssues(loaded.issues)}`);
    return 1;
  }
  const { doc, system } = loaded.value;

  if (command === "validate") {
    console.log(`✓ ${doc.name} — 부품 ${system.instances.length}개, Net ${system.nets.length}개`);
    return 0;
  }

  if (command === "case") {
    let profileInput: unknown = values.process;
    if (values.profile) {
      try {
        profileInput = JSON.parse(readFileSync(values.profile, "utf8"));
      } catch (e) {
        console.error(`✗ --profile ${values.profile}: ${(e as Error).message}`);
        return 2;
      }
    }
    const profile = resolveProfile(profileInput as string | undefined);
    if (!profile.ok) {
      console.error(`✗ ${profile.message}`);
      return 2;
    }
    const out = await writeCase(loaded.value, profile.value, values.out, file, values.meshes);
    console.log(out.summary);
    return out.ok ? 0 : 1;
  }

  const firmware = await compileFirmware(loaded.value);
  if (!firmware.ok) {
    console.error(`✗ 컴파일 실패\n${formatIssues(firmware.issues)}`);
    return 1;
  }
  const presses = (values.press ?? []).map((p) => parsePress(p, (t) => seconds(t, "press")));
  const result = runLoaded(loaded.value, { duration, dt, presses }, firmware.value);
  if (command === "report") {
    const report = analyzeCaptures(result.trace, { node: values.node, battery: values.battery });
    const capacity = capacityMah(loaded.value, values.battery);
    const perDay = values["per-day"].split(",").map(Number);
    console.log(`${loaded.value.doc.name}\n\n${formatReport(report, capacity, perDay)}`);
    return 0;
  }
  printRun(loaded.value, result, duration, values.json, limit);
  return Object.keys(result.programErrors).length ? 1 : 0;
}

function printRun(
  loaded: Loaded,
  result: RunResult,
  duration: number,
  json: boolean,
  limit: number,
) {
  const { doc, registry } = loaded;
  if (json) {
    console.log(JSON.stringify({ system: doc.name, duration, ...result }, null, 2));
  } else {
    const { entries, steps } = result.trace;
    console.log(
      `${doc.name} · ${formatTime(duration)} 시뮬레이션 · ${steps} 스텝 · ${result.wallMs.toFixed(0)} ms\n`,
    );
    const width = Math.max(...entries.map((e) => e.signal.length), 6);
    for (const e of entries.slice(0, limit)) {
      console.log(
        `  ${formatTime(e.time).padStart(9)}  ${e.signal.padEnd(width)}  ${formatValue(e.value, unitOf(registry, doc, e.signal))}`,
      );
    }
    if (entries.length > limit) console.log(`  … ${entries.length - limit}개 더 (--limit, --json)`);
    for (const [id, lines] of Object.entries(result.serial)) {
      console.log(`\n  ${id} 시리얼`);
      for (const l of lines.slice(-limit))
        console.log(`  ${formatTime(l.time).padStart(9)}  ${l.text}`);
    }
  }
  for (const [id, message] of Object.entries(result.programErrors))
    console.error(`✗ ${id} 프로그램 오류: ${message}`);
}

/** `--system`을 주면 그 System의 로컬 라이브러리까지 포함해 찾는다. */
function models(query: string | undefined, systemFile: string | undefined, json: boolean): number {
  let registry: Registry = createStandardRegistry();
  if (systemFile) {
    const loaded = loadSystemFile(systemFile);
    if (!loaded.ok) {
      console.error(`✗ ${systemFile}\n${formatIssues(loaded.issues)}`);
      return 1;
    }
    registry = loaded.value.registry;
  }
  const found = searchModels(registry, query);
  if (json) {
    const ids = new Set(found.flatMap((m) => m.capabilities.map((b) => b.capability)));
    console.log(
      JSON.stringify(
        { models: found, capabilities: registry.capabilities().filter((c) => ids.has(c.id)) },
        null,
        2,
      ),
    );
  } else {
    console.log(
      found.length
        ? found.map((m) => describeModel(registry, m)).join("\n\n")
        : "찾은 부품이 없다.",
    );
  }
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (e: Error) => {
    console.error(`✗ ${e.message}`);
    process.exitCode = 1;
  },
);
