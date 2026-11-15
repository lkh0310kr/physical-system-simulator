/** 부품 패널: Registry의 Model을 분류별로 보여 주고, 고르면 추가한다. 형식은 `physisim models`와 같은 정보. */
import type { Registry } from "@physisim/core";
import { useEffect, useRef, useState } from "react";

export function PartsPanel({
  registry,
  onPick,
}: {
  registry: Registry;
  onPick: (modelId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // 패널을 연 목적이 검색이므로 열리면 바로 입력할 수 있게 한다.
  useEffect(() => input.current?.focus(), []);
  const q = query.toLowerCase();
  const models = registry
    .models()
    .filter((m) => [m.id, m.name, m.category].some((t) => t.toLowerCase().includes(q)));
  const categories = [...new Set(models.map((m) => m.category))].sort();

  return (
    <div className="panel parts-panel">
      <input
        ref={input}
        placeholder="부품 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {categories.map((c) => (
        <div key={c}>
          <div className="category">{c}</div>
          {models
            .filter((m) => m.category === c)
            .map((m) => (
              <button key={m.id} type="button" className="item" onClick={() => onPick(m.id)}>
                <span>{m.name}</span>
                <span className="id">{m.id.replace(/^model\./, "")}</span>
              </button>
            ))}
        </div>
      ))}
      {models.length === 0 && <div className="muted">찾은 부품이 없다</div>}
    </div>
  );
}
