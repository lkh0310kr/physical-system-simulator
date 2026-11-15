/** dev 서버 프로젝트 파일 API 클라이언트 (`server/project-api.ts`). 경로는 프로젝트 기준 `/` 구분 상대 경로. */

export async function listFiles(): Promise<{ root: string; files: string[] }> {
  const res = await fetch("/api/files");
  if (!res.ok) throw new Error(`파일 목록을 가져올 수 없다 (${res.status})`);
  return res.json();
}

export async function readFile(path: string): Promise<string | undefined> {
  const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
  return res.ok ? res.text() : undefined;
}

export async function writeFile(path: string, content: string): Promise<void> {
  const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`, {
    method: "PUT",
    body: content,
  });
  if (!res.ok) throw new Error(`저장 실패: ${path} (${await res.text()})`);
}

/** 프로젝트 파일이 바뀌면 `listener(path)`. 해제 함수를 돌려준다. */
export function onFileChange(listener: (path: string) => void): () => void {
  const hot = import.meta.hot;
  if (!hot) return () => {};
  const handler = (data: { path: string }) => listener(data.path);
  hot.on("physisim:file", handler);
  return () => hot.off("physisim:file", handler);
}

/** `a/b/c.json`의 폴더 `a/b`. */
export const dirOf = (path: string) => path.split("/").slice(0, -1).join("/");

/** 폴더 기준 상대 경로를 프로젝트 경로로 (`.`·`..` 처리). */
export function joinPath(dir: string, rel: string): string {
  const parts: string[] = dir ? dir.split("/") : [];
  for (const p of rel.split("/")) {
    if (p === "..") parts.pop();
    else if (p && p !== ".") parts.push(p);
  }
  return parts.join("/");
}

/** 프로젝트의 Arduino 스케치를 dev 서버에서 컴파일한다. */
export async function compile(
  path: string,
): Promise<{ ok: true; hex: string } | { ok: false; issues: { path: string; message: string }[] }> {
  const res = await fetch(`/api/compile?path=${encodeURIComponent(path)}`, { method: "POST" });
  if (!res.ok) return { ok: false, issues: [{ path, message: await res.text() }] };
  return res.json();
}
