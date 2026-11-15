/** System 파일을 읽어 검증·실행한다. 출력 형식과 무관한 부분이라 테스트와 다른 도구에서 재사용한다. */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { isSketch, startPrograms } from "@physisim/avr";
import { compileSketch } from "@physisim/avr/compile";
import { type Issue, type LoadedSystem, loadSystemProject, type Result } from "@physisim/core";
import { createSimulation, recordTrace, type SerialLine, type Trace } from "@physisim/engine";
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

/** 문서의 `.ino` 프로그램을 컴파일한다. Instance ID → HEX. 하나라도 실패하면 모든 오류를 돌려준다. */
export async function compileFirmware(loaded: Loaded): Promise<Result<Map<string, string>>> {
  const firmware = new Map<string, string>();
  const issues: Issue[] = [];
  for (const inst of loaded.doc.instances) {
    const source = loaded.programs.get(inst.id);
    if (!inst.program || !isSketch(inst.program) || source === undefined) continue;
    const r = await compileSketch(source, { fileName: inst.program });
    if (r.ok) firmware.set(inst.id, r.value);
    else issues.push(...r.issues);
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: firmware };
}

/** 시뮬레이션 중 사람이 스위치를 누르는 일정. */
export interface Press {
  /** 스위치 Instance ID. */
  readonly instance: string;
  /** 누르는 시각 [s]. */
  readonly at: number;
  /** 누르고 있는 시간 [s]. */
  readonly hold: number;
}

export interface RunOptions {
  /** 시뮬레이션 중에 누를 스위치들. */
  readonly presses?: readonly Press[];
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

/** @param firmware `.ino` 프로그램의 컴파일 결과 (`compileFirmware`). */
export function runLoaded(
  loaded: Loaded,
  options: RunOptions,
  firmware: ReadonlyMap<string, string> = new Map(),
): RunResult {
  const started = performance.now();
  const sim = createSimulation(
    loaded.registry,
    loaded.system,
    options.dt ? { dt: options.dt } : {},
  );
  const programs = startPrograms(sim, loaded, firmware);
  for (const p of options.presses ?? []) {
    sim.schedule(p.at, () => sim.dispatch(p.instance, "capability.switching", { type: "press" }));
    sim.schedule(p.at + p.hold, () =>
      sim.dispatch(p.instance, "capability.switching", { type: "release" }),
    );
  }
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
