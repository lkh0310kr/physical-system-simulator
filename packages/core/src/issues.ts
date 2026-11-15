/** 검증 문제 하나. `path`는 문제 위치를 `capabilities[0].config.pinCount`처럼 표기한다. */
export interface Issue {
  readonly path: string;
  readonly message: string;
}

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly Issue[] };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T = never>(issues: readonly Issue[]): Result<T> => ({ ok: false, issues });

/** 경로 조각을 이어 붙인다. 숫자는 `[0]`, 문자열은 `.key`. */
export function joinPath(...parts: readonly (string | number)[]): string {
  let path = "";
  for (const p of parts) {
    if (typeof p === "number") path += `[${p}]`;
    else if (p !== "") path += path ? `.${p}` : p;
  }
  return path;
}

/** 사람이 읽을 수 있는 여러 줄 오류 메시지. */
export function formatIssues(issues: readonly Issue[]): string {
  return issues.map((i) => `- ${i.path || "(root)"}: ${i.message}`).join("\n");
}
