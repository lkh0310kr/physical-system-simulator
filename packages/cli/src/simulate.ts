/** System 파일을 읽어 검증·실행한다. 출력 형식과 무관한 부분이라 테스트와 다른 도구에서 재사용한다. */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { type LoadedSystem, loadSystemProject, type Result } from "@physisim/core";
import {
  createSimulation,
  loadProgram,
  recordTrace,
  type SerialLine,
  type Trace,
} from "@physisim/engine";
import { createStandardRegistry } from "@physisim/models";

export type Loaded = LoadedSystem;
export type LoadResult = Result<Loaded>;

/** System 파일과 그 문서가 참조하는 라이브러리·프로그램 파일을 디스크에서 읽는다. */
export function loadSystemFile(path: string): LoadResult {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    return { ok: false, issues: [{ path, message: (e as Error).message }] };
  }
  const read = (rel: string) => {
    try {
      return readFileSync(resolve(dirname(path), rel), "utf8");
    } catch {
      return undefined;
    }
  };
  return loadSystemProject(json, read, createStandardRegistry);
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
  /** Instance ID → 시리얼 출력 줄. */
  readonly serial: Readonly<Record<string, readonly SerialLine[]>>;
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
  const serial = Object.fromEntries(
    programs.filter(([, p]) => p.serial.length).map(([id, p]) => [id, p.serial]),
  );
  return { trace, programErrors, serial, wallMs: performance.now() - started };
}
