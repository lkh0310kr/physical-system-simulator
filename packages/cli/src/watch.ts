/**
 * 파일 감시 (스펙 §10.1): System 문서·프로그램·로컬 라이브러리 파일이 바뀌면 다시 검증·실행한다.
 * 에디터·에이전트는 파일을 원자적으로 교체(rename)하기도 해서, 파일이 아니라 폴더를 감시하고 이름으로 거른다.
 */
import { type FSWatcher, watch } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import type { Issue } from "@physisim/core";
import {
  compileFirmware,
  type Loaded,
  loadSystemFile,
  type RunOptions,
  type RunResult,
  runLoaded,
} from "./simulate.ts";

export type WatchResult =
  | { readonly ok: true; readonly loaded: Loaded; readonly run: RunResult }
  | { readonly ok: false; readonly issues: readonly Issue[] };

export interface WatchOptions extends RunOptions {
  /** 연속 변경을 하나로 묶는 시간 [ms]. 기본 100. */
  readonly debounceMs?: number;
}

/** 감시 대상 파일 (절대 경로). 로드에 실패해도 System 문서는 항상 포함한다. */
function filesOf(systemPath: string, loaded?: Loaded): string[] {
  const base = dirname(systemPath);
  const files = [systemPath];
  for (const inst of loaded?.doc.instances ?? [])
    if (inst.program) files.push(resolve(base, inst.program));
  for (const lib of loaded?.doc.library ?? []) files.push(resolve(base, lib));
  return files;
}

export function watchSystem(
  path: string,
  options: WatchOptions,
  onResult: (result: WatchResult) => void,
): { close(): void; files(): readonly string[] } {
  const systemPath = resolve(path);
  const debounceMs = options.debounceMs ?? 100;
  let watched: string[] = [];
  let watchers: FSWatcher[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  function rewatch(files: string[]) {
    for (const w of watchers) w.close();
    watched = files;
    const byDir = new Map<string, Set<string>>();
    for (const f of files)
      byDir.set(dirname(f), (byDir.get(dirname(f)) ?? new Set()).add(basename(f)));
    watchers = [...byDir].map(([dir, names]) =>
      watch(dir, (_event, name) => {
        if (name && names.has(name.toString())) schedule();
      }),
    );
  }

  async function reload() {
    if (closed) return;
    const loaded = loadSystemFile(systemPath);
    if (loaded.ok) {
      rewatch(filesOf(systemPath, loaded.value));
      const firmware = await compileFirmware(loaded.value);
      if (closed) return;
      if (!firmware.ok) {
        onResult(firmware);
        return;
      }
      let run: RunResult;
      try {
        run = runLoaded(loaded.value, options, firmware.value);
      } catch (e) {
        onResult({ ok: false, issues: [{ path: systemPath, message: (e as Error).message }] });
        return;
      }
      onResult({ ok: true, loaded: loaded.value, run });
    } else {
      // 고장 난 상태에서도 기존 감시 대상(프로그램 등)은 유지해 고쳐지면 다시 돈다.
      rewatch([...new Set([...watched, ...filesOf(systemPath)])]);
      onResult(loaded);
    }
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void reload(), debounceMs);
  }

  void reload();
  return {
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      for (const w of watchers) w.close();
    },
    files: () => watched,
  };
}
