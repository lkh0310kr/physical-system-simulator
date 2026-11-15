/** System 파일을 읽어 검증·실행한다. 출력 형식과 무관한 부분이라 테스트와 다른 도구에서 재사용한다. */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  type BuiltSystem,
  buildSystem,
  type Issue,
  loadLibrary,
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

function readJson(path: string): { ok: true; value: unknown } | { ok: false; issues: Issue[] } {
  try {
    return { ok: true, value: JSON.parse(readFileSync(path, "utf8")) };
  } catch (e) {
    return { ok: false, issues: [{ path, message: (e as Error).message }] };
  }
}

/** 표준 라이브러리 + System 문서의 `library` 파일들. 파일당 정의 1개, 종류는 ID 접두어로 구분. */
function loadRegistry(
  doc: SystemDoc,
  baseDir: string,
): { ok: true; value: Registry } | { ok: false; issues: readonly Issue[] } {
  const models: unknown[] = [];
  const capabilities: unknown[] = [];
  const issues: Issue[] = [];
  for (const rel of doc.library) {
    const file = resolve(baseDir, rel);
    const json = readJson(file);
    if (!json.ok) {
      issues.push({ path: rel, message: json.issues[0]?.message ?? "읽을 수 없다" });
      continue;
    }
    const id = (json.value as { id?: unknown } | null)?.id;
    if (typeof id === "string" && id.startsWith("model.")) models.push(json.value);
    else if (typeof id === "string" && id.startsWith("capability.")) capabilities.push(json.value);
    else issues.push({ path: rel, message: '"id"가 "model." 또는 "capability."로 시작해야 한다' });
  }
  if (issues.length) return { ok: false, issues };
  return loadLibrary({ models, capabilities }, createStandardRegistry());
}

export function loadSystemFile(path: string): LoadResult {
  const json = readJson(path);
  if (!json.ok) return json;
  const doc = parseSystem(json.value);
  if (!doc.ok) return doc;
  const lib = loadRegistry(doc.value, dirname(path));
  if (!lib.ok) return lib;
  const registry = lib.value;
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
