/** System 파일을 읽어 검증·실행한다. 출력 형식과 무관한 부분이라 테스트와 다른 도구에서 재사용한다. */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  type BuiltSystem,
  buildSystem,
  type Issue,
  parseSystem,
  type Registry,
  type SystemDoc,
} from "@physisim/core";
import { createSimulation, loadProgram, recordTrace, type Trace } from "@physisim/engine";
import { createStandardRegistry } from "@physisim/models";

export interface Loaded {
  readonly registry: Registry;
  readonly doc: SystemDoc;
  readonly system: BuiltSystem;
  /** Instance ID → 프로그램 소스. */
  readonly programs: ReadonlyMap<string, string>;
}

export type LoadResult = { ok: true; value: Loaded } | { ok: false; issues: readonly Issue[] };

export function loadSystemFile(path: string): LoadResult {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    return { ok: false, issues: [{ path, message: (e as Error).message }] };
  }
  const doc = parseSystem(json);
  if (!doc.ok) return doc;
  const registry = createStandardRegistry();
  const system = buildSystem(registry, doc.value);
  if (!system.ok) return system;

  const programs = new Map<string, string>();
  const issues: Issue[] = [];
  doc.value.instances.forEach((inst, i) => {
    if (!inst.program) return;
    const file = resolve(dirname(path), inst.program);
    try {
      programs.set(inst.id, readFileSync(file, "utf8"));
    } catch (e) {
      issues.push({ path: `instances[${i}].program`, message: (e as Error).message });
    }
  });
  if (issues.length) return { ok: false, issues };
  return { ok: true, value: { registry, doc: doc.value, system: system.value, programs } };
}

export interface RunOptions {
  /** [s] */
  readonly duration: number;
  /** [s] */
  readonly dt?: number;
}

export interface RunResult {
  readonly trace: Trace;
  /** Instance ID → 프로그램 오류 메시지. */
  readonly programErrors: Readonly<Record<string, string>>;
  /** 실제 걸린 시간 [ms]. */
  readonly wallMs: number;
}

export function runLoaded(loaded: Loaded, options: RunOptions): RunResult {
  const started = performance.now();
  const sim = createSimulation(
    loaded.registry,
    loaded.system,
    options.dt ? { dt: options.dt } : {},
  );
  const programs = [...loaded.programs].map(
    ([id, source]) => [id, loadProgram(sim, id, source)] as const,
  );
  const recorder = recordTrace(sim);
  sim.run(options.duration);
  const trace = recorder.stop();
  const programErrors = Object.fromEntries(
    programs.flatMap(([id, p]) => (p.error ? [[id, p.error.message]] : [])),
  );
  return { trace, programErrors, wallMs: performance.now() - started };
}
