#!/usr/bin/env node
/** physisim CLI. 사용법은 USAGE 참고. */
import { parseArgs } from "node:util";
import { formatIssues, parseQuantity, type Registry } from "@physisim/core";
import { createStandardRegistry } from "@physisim/models";
import { describeModel, searchModels } from "./catalog.ts";
import { formatTime, formatValue, unitOf } from "./format.ts";
import { loadSystemFile, runLoaded } from "./simulate.ts";

const USAGE = `사용법:
  physisim models [검색어] [--system <system.json>] [--json]   부품 찾기
  physisim validate <system.json>                              검증
  physisim run <system.json> [--duration 2s] [--dt 1ms] [--json] [--limit 40]`;

function seconds(text: string, name: string): number {
  const q = parseQuantity(text);
  if (q.unit.dimension.some((d, i) => d !== (i === 2 ? 1 : 0)))
    throw new Error(`--${name}은 시간이어야 한다 (예: 2s, 500ms)`);
  return q.value;
}

function main(argv: string[]): number {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      duration: { type: "string", default: "2s" },
      dt: { type: "string", default: "1ms" },
      json: { type: "boolean", default: false },
      limit: { type: "string", default: "40" },
      system: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, file] = positionals;
  if (command === "models" && !values.help) return models(file, values.system, values.json);
  if (values.help || !command || !file || !["validate", "run"].includes(command)) {
    console.log(USAGE);
    return values.help ? 0 : 2;
  }

  const loaded = loadSystemFile(file);
  if (!loaded.ok) {
    console.error(`✗ ${file}\n${formatIssues(loaded.issues)}`);
    return 1;
  }
  const { doc, system, registry } = loaded.value;

  if (command === "validate") {
    console.log(`✓ ${doc.name} — 부품 ${system.instances.length}개, Net ${system.nets.length}개`);
    return 0;
  }

  const duration = seconds(values.duration, "duration");
  const result = runLoaded(loaded.value, { duration, dt: seconds(values.dt, "dt") });

  if (values.json) {
    console.log(JSON.stringify({ system: doc.name, duration, ...result }, null, 2));
  } else {
    const { entries, steps } = result.trace;
    console.log(
      `${doc.name} · ${formatTime(duration)} 시뮬레이션 · ${steps} 스텝 · ${result.wallMs.toFixed(0)} ms\n`,
    );
    const width = Math.max(...entries.map((e) => e.signal.length), 6);
    const limit = Number(values.limit);
    for (const e of entries.slice(0, limit)) {
      console.log(
        `  ${formatTime(e.time).padStart(9)}  ${e.signal.padEnd(width)}  ${formatValue(e.value, unitOf(registry, doc, e.signal))}`,
      );
    }
    if (entries.length > limit) console.log(`  … ${entries.length - limit}개 더 (--limit, --json)`);
  }
  for (const [id, message] of Object.entries(result.programErrors))
    console.error(`✗ ${id} 프로그램 오류: ${message}`);
  return Object.keys(result.programErrors).length ? 1 : 0;
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

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exitCode = 1;
}
