/**
 * System 문서 + 로컬 라이브러리 + 프로그램을 한 번에 불러온다. 파일 I/O는 호출자가 `read`로 제공한다
 * (CLI는 디스크, 웹은 dev 서버에서 미리 받아 둔 내용). 경로는 문서에 적힌 그대로(문서 기준 상대 경로) 넘어온다.
 */
import { type BuiltSystem, buildSystem } from "./compose.ts";
import { fail, type Issue, joinPath, ok, type Result } from "./issues.ts";
import { loadLibrary } from "./loader.ts";
import type { Registry } from "./registry.ts";
import { parseSystem, type SystemDoc } from "./system.ts";

export interface LoadedSystem {
  readonly registry: Registry;
  readonly doc: SystemDoc;
  readonly system: BuiltSystem;
  /** Instance ID → 프로그램 소스. */
  readonly programs: ReadonlyMap<string, string>;
}

/** 문서가 참조하는 파일 (라이브러리 + 프로그램), 문서 기준 상대 경로. */
export function referencedFiles(doc: SystemDoc): string[] {
  return [...doc.library, ...doc.instances.flatMap((i) => (i.program ? [i.program] : []))];
}

/**
 * @param read 문서 기준 상대 경로의 파일 내용. 없으면 `undefined`.
 * @param baseRegistry 로컬 라이브러리를 더할 기본 Registry를 새로 만든다 (보통 표준 라이브러리).
 */
export function loadSystemProject(
  json: unknown,
  read: (path: string) => string | undefined,
  baseRegistry: () => Registry,
): Result<LoadedSystem> {
  const doc = parseSystem(json);
  if (!doc.ok) return doc;

  const models: unknown[] = [];
  const capabilities: unknown[] = [];
  const issues: Issue[] = [];
  for (const path of doc.value.library) {
    const text = read(path);
    if (text === undefined) {
      issues.push({ path, message: "파일을 읽을 수 없다" });
      continue;
    }
    let def: unknown;
    try {
      def = JSON.parse(text);
    } catch (e) {
      issues.push({ path, message: (e as Error).message });
      continue;
    }
    const id = (def as { id?: unknown } | null)?.id;
    if (typeof id === "string" && id.startsWith("model.")) models.push(def);
    else if (typeof id === "string" && id.startsWith("capability.")) capabilities.push(def);
    else issues.push({ path, message: '"id"가 "model." 또는 "capability."로 시작해야 한다' });
  }
  if (issues.length) return fail(issues);

  const lib = loadLibrary({ models, capabilities }, baseRegistry());
  if (!lib.ok) return lib;
  const system = buildSystem(lib.value, doc.value);
  if (!system.ok) return system;

  const programs = new Map<string, string>();
  doc.value.instances.forEach((inst, i) => {
    if (!inst.program) return;
    const source = read(inst.program);
    if (source === undefined) {
      issues.push({
        path: joinPath("instances", i, "program"),
        message: `파일을 읽을 수 없다: ${inst.program}`,
      });
    } else programs.set(inst.id, source);
  });
  if (issues.length) return fail(issues);
  return ok({ registry: lib.value, doc: doc.value, system: system.value, programs });
}
