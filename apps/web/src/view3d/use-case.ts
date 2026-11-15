/** dev 서버의 케이스 API(`/api/case`)에서 검증된 케이스 메시를 받아 온다. */
import { useEffect, useState } from "react";

export interface CaseMesh {
  readonly positions: number[];
  readonly indices: number[];
}

export interface CaseIssue {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
}

export interface CaseData {
  readonly ok: boolean;
  readonly issues: readonly CaseIssue[];
  readonly base: CaseMesh;
  readonly lid: CaseMesh;
  /** 출력 자세(베드 위에 평평하게, 뚜껑은 뒤집힘). */
  readonly print: { readonly base: CaseMesh; readonly lid: CaseMesh };
  readonly process: string;
}

export type CaseState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly data: CaseData };

/** `enabled`일 때만 요청한다. 시스템 파일이 바뀌면(`version`) 다시 만든다. */
export function useCase(path: string | undefined, enabled: boolean, version: unknown): CaseState {
  const [state, setState] = useState<CaseState>({ status: "idle" });
  // biome-ignore lint/correctness/useExhaustiveDependencies: version은 재요청 트리거로만 쓴다.
  useEffect(() => {
    if (!enabled || !path) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    fetch(`/api/case?path=${encodeURIComponent(path)}`)
      .then(async (r) => {
        // 서버 오류는 JSON이 아니라 평문일 수 있다 — 진짜 메시지를 가리지 않게 글로 먼저 읽는다
        const raw = await r.text();
        if (cancelled) return;
        let body: { message?: string } | CaseData | undefined;
        try {
          body = JSON.parse(raw);
        } catch {
          body = undefined;
        }
        if (!r.ok || !body)
          setState({
            status: "error",
            message:
              (body as { message?: string } | undefined)?.message ??
              (raw.slice(0, 200) || `HTTP ${r.status}`),
          });
        else setState({ status: "ready", data: body as CaseData });
      })
      .catch((e: Error) => !cancelled && setState({ status: "error", message: e.message }));
    return () => {
      cancelled = true;
    };
  }, [path, enabled, version]);
  return state;
}

export const downloadUrl = (path: string, file: "base" | "lid" | "3mf" | "bom") =>
  `/api/case/download?path=${encodeURIComponent(path)}&file=${file}`;
