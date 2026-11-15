/**
 * 열린 System 파일과 그 의존 파일을 dev 서버에서 불러오고, 파일이 바뀌면 다시 불러온다.
 * 같은 파일을 에이전트와 에디터가 함께 고치므로 "파일 = 진실"이다. 화면 상태는 파일에서 다시 만든다.
 */

import { isSketch } from "@physisim/avr";
import {
  type Issue,
  type LoadedSystem,
  loadSystemProject,
  referencedFiles,
  SystemSchema,
} from "@physisim/core";
import { createStandardRegistry } from "@physisim/models";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatJson } from "./edit.ts";
import {
  compile,
  dirOf,
  joinPath,
  listFiles,
  onFileChange,
  readFile,
  writeFile,
} from "./project-client.ts";

export interface ProjectState {
  readonly files: readonly string[];
  readonly systems: readonly string[];
  readonly path: string | undefined;
  /** 파일에 적힌 그대로의 문서 JSON (편집은 이것을 고쳐 저장한다). */
  readonly docJson: unknown;
  readonly loaded: LoadedSystem | undefined;
  /** 문서가 참조하는 파일 내용 (문서 기준 상대 경로 → 내용). 시뮬레이션 Worker에 넘긴다. */
  readonly refs: Readonly<Record<string, string>>;
  /** Instance ID → 컴파일된 펌웨어(Intel HEX). `.ino` 프로그램용. */
  readonly firmware: Readonly<Record<string, string>>;
  /** 스케치를 컴파일하는 중인지. */
  readonly compiling: boolean;
  readonly issues: readonly Issue[];
  /** 마지막으로 불러온 시각 — 다시 불러올 때마다 바뀐다. */
  readonly revision: number;
}

const EMPTY: ProjectState = {
  files: [],
  systems: [],
  path: undefined,
  docJson: undefined,
  loaded: undefined,
  refs: {},
  firmware: {},
  compiling: false,
  issues: [],
  revision: 0,
};

type Loaded = Pick<ProjectState, "docJson" | "loaded" | "refs" | "firmware" | "issues">;

async function load(path: string): Promise<Loaded> {
  const failed = (message: string): Loaded => ({
    docJson: undefined,
    loaded: undefined,
    refs: {},
    firmware: {},
    issues: [{ path, message }],
  });
  const text = await readFile(path);
  if (text === undefined) return failed("파일을 읽을 수 없다");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return failed((e as Error).message);
  }
  const parsed = SystemSchema.safeParse(json);
  const paths = parsed.success ? referencedFiles(parsed.data) : [];
  const refs: Record<string, string> = {};
  await Promise.all(
    paths.map(async (rel) => {
      const content = await readFile(joinPath(dirOf(path), rel));
      if (content !== undefined) refs[rel] = content;
    }),
  );
  const r = loadSystemProject(json, (rel) => refs[rel], createStandardRegistry);
  if (!r.ok) return { docJson: json, loaded: undefined, refs, firmware: {}, issues: r.issues };

  // Arduino 스케치는 dev 서버가 컴파일한다 (같은 소스는 캐시되어 빠르다).
  const firmware: Record<string, string> = {};
  const issues: Issue[] = [];
  await Promise.all(
    r.value.doc.instances.map(async (inst) => {
      if (!inst.program || !isSketch(inst.program)) return;
      const c = await compile(joinPath(dirOf(path), inst.program));
      if (c.ok) firmware[inst.id] = c.hex;
      else issues.push(...c.issues);
    }),
  );
  return { docJson: json, loaded: r.value, refs, firmware, issues };
}

export function useProject() {
  const [state, setState] = useState<ProjectState>(EMPTY);
  const pathRef = useRef<string | undefined>(undefined);
  const stateRef = useRef(state);
  stateRef.current = state;
  const past = useRef<unknown[]>([]);
  const future = useRef<unknown[]>([]);

  /** 문서를 바꿔 화면에 바로 반영하고 파일에 저장한다. 검증에 실패해도 마지막 정상 상태로 계속 그린다. */
  const apply = useCallback(async (next: unknown) => {
    const path = pathRef.current;
    if (!path) return;
    setState((s) => {
      const r = loadSystemProject(next, (rel) => s.refs[rel], createStandardRegistry);
      return {
        ...s,
        docJson: next,
        loaded: r.ok ? r.value : s.loaded,
        issues: r.ok ? [] : r.issues,
        revision: s.revision + 1,
      };
    });
    await writeFile(path, formatJson(next));
  }, []);

  const update = useCallback(
    (next: unknown) => {
      past.current.push(stateRef.current.docJson);
      future.current = [];
      return apply(next);
    },
    [apply],
  );
  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (prev === undefined) return;
    future.current.push(stateRef.current.docJson);
    return apply(prev);
  }, [apply]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (next === undefined) return;
    past.current.push(stateRef.current.docJson);
    return apply(next);
  }, [apply]);

  const open = useCallback(async (path: string) => {
    if (pathRef.current !== path) {
      past.current = [];
      future.current = [];
    }
    pathRef.current = path;
    setState((s) => ({ ...s, compiling: true }));
    const result = await load(path);
    if (pathRef.current !== path) return;
    const url = new URL(location.href);
    url.searchParams.set("system", path);
    history.replaceState(null, "", url);
    setState((s) => {
      // 방금 저장한 내용이 감시로 돌아온 경우: 이미 반영돼 있으므로 다시 그리지 않는다.
      if (
        s.path === path &&
        JSON.stringify(s.docJson) === JSON.stringify(result.docJson) &&
        result.loaded
      ) {
        return {
          ...s,
          refs: result.refs,
          firmware: result.firmware,
          issues: result.issues,
          compiling: false,
        };
      }
      return {
        ...s,
        path,
        ...result,
        loaded: result.loaded ?? (s.path === path ? s.loaded : undefined),
        compiling: false,
        revision: s.revision + 1,
      };
    });
  }, []);

  const refreshFiles = useCallback(async () => {
    const { files } = await listFiles();
    const systems = files.filter((f) => f.endsWith(".system.json"));
    setState((s) => ({ ...s, files, systems }));
    return systems;
  }, []);

  useEffect(() => {
    refreshFiles().then((systems) => {
      const wanted = new URL(location.href).searchParams.get("system");
      const first = wanted && systems.includes(wanted) ? wanted : systems[0];
      if (first) open(first);
    });
  }, [open, refreshFiles]);

  // 열린 문서나 그 의존 파일이 바뀌면 다시 불러온다.
  useEffect(
    () =>
      onFileChange(() => {
        refreshFiles();
        if (pathRef.current) open(pathRef.current);
      }),
    [open, refreshFiles],
  );

  /** 문서 기준 상대 경로의 파일을 쓴다 (프로그램 등). 감시가 다시 불러온다. */
  const saveFile = useCallback(async (rel: string, content: string) => {
    const path = pathRef.current;
    if (path) await writeFile(joinPath(dirOf(path), rel), content);
  }, []);

  return { ...state, open, update, undo, redo, saveFile };
}
