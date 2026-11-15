/** MCU 프로그램 편집기 + 시리얼 출력. 저장(⌘S, 포커스 이동)하면 파일에 쓰고, 감시가 시뮬레이션을 새 코드로 다시 시작한다. */
import type { LoadedSystem } from "@physisim/core";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { CloseIcon } from "./icons.tsx";

interface Props {
  readonly loaded: LoadedSystem;
  /** 문서 기준 상대 경로 → 내용. */
  readonly files: Readonly<Record<string, string>>;
  readonly serial: Readonly<Record<string, readonly { time: number; text: string }[]>>;
  readonly onSave: (path: string, content: string) => void;
  readonly onCreate: (instanceId: string) => void;
  readonly onClose: () => void;
}

export function CodePanel({ loaded, files, serial, onSave, onCreate, onClose }: Props) {
  const withProgram = loaded.doc.instances.filter((i) => i.program);
  const mcus = loaded.doc.instances.filter(
    (i) =>
      !i.program &&
      loaded.registry
        .getModel(i.model)
        ?.capabilities.some((c) => c.capability === "capability.gpio"),
  );
  const [tab, setTab] = useState(withProgram[0]?.id);
  const current = withProgram.find((i) => i.id === tab) ?? withProgram[0];
  const path = current?.program;
  const saved = path ? (files[path] ?? "") : "";
  const [text, setText] = useState(saved);
  // 바깥(에이전트 등)에서 파일이 바뀌면 따라가되, 저장 안 한 수정이 있으면 덮어쓰지 않고 알린다.
  const base = useRef(saved);
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    setText((t) => {
      const clean = t === base.current;
      setConflict(!clean && t !== saved);
      return clean ? saved : t;
    });
    base.current = saved;
  }, [saved]);
  const dirty = text !== saved;

  const lines = current ? (serial[current.id] ?? []) : [];
  // 새 출력이 오면 시리얼 영역을 맨 아래로 (터미널처럼).
  const serialBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = serialBox.current;
    if (el) el.scrollTop = el.scrollHeight;
  });

  const save = () => {
    if (path && dirty) onSave(path, text);
    setConflict(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      save();
    } else if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart: a, selectionEnd: b } = el;
      setText(`${text.slice(0, a)}  ${text.slice(b)}`);
      requestAnimationFrame(() => el.setSelectionRange(a + 2, a + 2));
    }
  };

  return (
    <section className="panel code-panel">
      <header>
        <div className="tabs">
          {withProgram.map((i) => (
            <button
              key={i.id}
              type="button"
              className={i.id === current?.id ? "on" : ""}
              onClick={() => setTab(i.id)}
            >
              {i.id} <span className="muted">{i.program}</span>
            </button>
          ))}
          {dirty && !conflict && <span className="muted">저장 안 됨 · ⌘S</span>}
          {conflict && (
            <span className="warn">
              파일이 바깥에서 바뀌었다 ·{" "}
              <button type="button" className="reset" onClick={() => setText(saved)}>
                파일 내용 불러오기
              </button>
            </span>
          )}
        </div>
        <button type="button" className="icon" onClick={onClose} title="닫기">
          <CloseIcon />
        </button>
      </header>

      {current ? (
        <textarea
          className="code"
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={save}
          onKeyDown={onKeyDown}
        />
      ) : (
        <div className="muted empty">프로그램이 연결된 MCU가 없다.</div>
      )}

      {mcus.length > 0 && (
        <div className="create">
          {mcus.map((m) => (
            <button key={m.id} type="button" className="reset" onClick={() => onCreate(m.id)}>
              {m.id}에 프로그램 만들기
            </button>
          ))}
        </div>
      )}

      {current && (
        <div className="serial" ref={serialBox}>
          {lines.length === 0 && <span className="muted">시리얼 출력 없음 (Serial.println)</span>}
          {lines.map((l, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 시리얼 줄은 순서가 곧 정체성이다.
            <div key={i}>
              <span className="muted">{l.time.toFixed(3)}</span> {l.text}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
