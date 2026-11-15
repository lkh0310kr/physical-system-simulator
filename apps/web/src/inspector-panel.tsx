/** 선택한 부품의 속성 폼 (Property Schema에서 자동 생성) + 실시간 출력값. */
import {
  formatQuantity,
  type LoadedSystem,
  type PropertyDefinition,
  type PropertyValue,
} from "@physisim/core";
import { useEffect, useId, useState } from "react";
import { CloseIcon } from "./icons.tsx";
import { checkValue, displayValue, parseInput } from "./inspector.ts";

interface Props {
  readonly loaded: LoadedSystem;
  readonly id: string;
  readonly signals: Readonly<Record<string, unknown>>;
  /** `value`가 undefined면 override를 지운다. */
  readonly onChange: (key: string, value: PropertyValue | undefined) => void;
  readonly onClose: () => void;
}

function Field({
  name,
  def,
  value,
  overridden,
  onCommit,
}: {
  name: string;
  def: PropertyDefinition;
  value: PropertyValue | undefined;
  overridden: boolean;
  onCommit: (v: PropertyValue | undefined) => void;
}) {
  const inputId = useId();
  const [text, setText] = useState(displayValue(def, value));
  const [error, setError] = useState<string | undefined>(undefined);
  useEffect(() => {
    setText(displayValue(def, value));
    setError(undefined);
  }, [def, value]);

  const commit = (raw: string) => {
    if (raw.trim() === displayValue(def, value)) return;
    const v = parseInput(def, raw);
    const message = checkValue(def, v);
    setError(message);
    if (!message) onCommit(v);
  };

  return (
    <div className="field">
      <span className="field-name">
        <label htmlFor={inputId}>{name}</label>
        {overridden && (
          <button
            type="button"
            className="reset"
            onClick={() => onCommit(undefined)}
            title="Model 값으로"
          >
            기본값
          </button>
        )}
      </span>
      {def.type === "enum" ? (
        <select id={inputId} value={String(value ?? "")} onChange={(e) => onCommit(e.target.value)}>
          {def.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : def.type === "boolean" ? (
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onCommit(e.target.checked)}
        />
      ) : (
        <input
          id={inputId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && commit(e.currentTarget.value)}
          className={error ? "invalid" : ""}
        />
      )}
      {error && <span className="field-error">{error}</span>}
      {def.description && <span className="field-help">{def.description}</span>}
    </div>
  );
}

export function Inspector({ loaded, id, signals, onChange, onClose }: Props) {
  const decl = loaded.doc.instances.find((i) => i.id === id);
  const model = decl && loaded.registry.getModel(decl.model);
  if (!decl || !model) return null;

  const outputs = Object.entries(signals).filter(([k]) => k.startsWith(`${id}.`));
  const unitOf = (key: string) => {
    for (const b of model.capabilities) {
      const def = loaded.registry.getCapability(b.capability)?.outputs[key];
      if (def?.type === "number") return def.unit ?? "";
    }
    return "";
  };

  return (
    <aside className="panel inspector">
      <header>
        <div>
          <strong>{id}</strong>
          <div className="muted">{model.name}</div>
        </div>
        <button type="button" className="icon" onClick={onClose} title="닫기 (Esc)">
          <CloseIcon />
        </button>
      </header>

      {Object.entries(model.propertySchema).map(([key, def]) => (
        <Field
          key={key}
          name={key}
          def={def}
          value={decl.properties[key] ?? model.properties[key] ?? def.default}
          overridden={key in decl.properties}
          onCommit={(v) => onChange(key, v)}
        />
      ))}
      {Object.keys(model.propertySchema).length === 0 && <div className="muted">속성 없음</div>}

      {outputs.length > 0 && (
        <section className="outputs">
          {outputs.map(([k, v]) => {
            const key = k.slice(id.length + 1);
            const text =
              typeof v === "number"
                ? formatQuantity(v, unitOf(key))
                : typeof v === "boolean"
                  ? v
                    ? "HIGH"
                    : "LOW"
                  : String(v);
            return (
              <div key={k} className="output">
                <span className="muted">{key}</span>
                <span className="value">{text}</span>
              </div>
            );
          })}
        </section>
      )}
    </aside>
  );
}
