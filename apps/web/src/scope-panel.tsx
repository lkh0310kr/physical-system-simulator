/** 오실로스코프: 시뮬레이션 신호를 골라 최근 5초 파형을 본다. 값은 프레임마다 쌓는다 (순수 함수는 scope-history.ts). */
import { useEffect, useMemo, useState } from "react";
import { CloseIcon } from "./icons.tsx";
import { pushFrame, type ScopeHistory, toPoints } from "./scope-history.ts";
import type { Frame } from "./sim/protocol.ts";

const W = 300;
const H = 90;
const WINDOW = 5;

export function ScopePanel({ frame, onClose }: { frame: Frame | undefined; onClose: () => void }) {
  const [history, setHistory] = useState<ScopeHistory>({});
  const [picked, setPicked] = useState<string | undefined>();
  const time = frame?.time;
  const signals = frame?.signals;

  useEffect(() => {
    if (time === undefined || !signals) return;
    setHistory((h) => pushFrame(h, time, signals, WINDOW));
  }, [time, signals]);

  const keys = useMemo(() => Object.keys(history).sort(), [history]);
  const key = picked && keys.includes(picked) ? picked : keys[0];
  const samples = key ? (history[key] ?? []) : [];
  const last = samples.at(-1)?.v;

  return (
    <div className="float scope-panel">
      <div className="scope-head">
        <select value={key ?? ""} onChange={(e) => setPicked(e.target.value)} aria-label="신호">
          {keys.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <span className="scope-value">{last === undefined ? "—" : last.toPrecision(4)}</span>
        <button type="button" className="round small" onClick={onClose} title="닫기">
          <CloseIcon />
        </button>
      </div>
      <svg className="scope-plot" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="신호 파형">
        <title>신호 파형</title>
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} className="scope-axis" />
        <polyline points={toPoints(samples, W, H, WINDOW)} className="scope-line" />
      </svg>
      <div className="scope-foot">최근 {WINDOW}초</div>
    </div>
  );
}
