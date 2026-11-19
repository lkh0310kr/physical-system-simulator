/** 예제 갤러리: 프로젝트의 모든 System을 이름·설명으로 훑어 보고 바로 연다 (서버를 따로 띄울 필요가 없다). */
import { useEffect, useMemo, useState } from "react";
import { CloseIcon } from "./icons.tsx";
import { listSystems, type SystemSummary } from "./project-client.ts";

/** 검색어가 이름·설명·파일 경로에 들어 있는 항목 (대소문자 무시). */
export function filterSystems(items: readonly SystemSummary[], query: string): SystemSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  return items.filter((s) =>
    [s.name, s.description, s.path].some((t) => t.toLowerCase().includes(q)),
  );
}

export function ExamplesPanel({
  current,
  onOpen,
  onClose,
}: {
  current: string | undefined;
  onOpen: (path: string) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<SystemSummary[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    listSystems()
      .then(setItems)
      .catch((e: Error) => setError(e.message));
  }, []);
  const shown = useMemo(() => filterSystems(items, query), [items, query]);
  return (
    <div className="float examples-panel">
      <div className="examples-head">
        <input
          type="search"
          placeholder={`예제 ${items.length}개 검색`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="예제 검색"
        />
        <button type="button" className="round small" onClick={onClose} title="닫기">
          <CloseIcon />
        </button>
      </div>
      {error && <div className="muted">{error}</div>}
      <ul className="examples-list">
        {shown.map((s) => (
          <li key={s.path}>
            <button
              type="button"
              className={s.path === current ? "on" : ""}
              onClick={() => {
                onOpen(s.path);
                onClose();
              }}
            >
              <strong>{s.name}</strong>
              <span className="muted">
                {s.parts}개 부품 · {s.path}
              </span>
              {s.description && <em>{s.description}</em>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
