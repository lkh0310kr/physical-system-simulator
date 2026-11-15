import { formatIssues } from "@physisim/core";
import { useEffect, useRef, useState } from "react";
import { Canvas, type Selection } from "./canvas/canvas.tsx";
import { CodePanel } from "./code-panel.tsx";
import {
  addInstance,
  connect,
  disconnect,
  moveInstance,
  PROGRAM_TEMPLATE,
  removeInstance,
  rotateInstance,
  setProgram,
  setProperty,
} from "./edit.ts";
import {
  CodeIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  ResetIcon,
  RotateIcon,
  TrashIcon,
} from "./icons.tsx";
import { Inspector } from "./inspector-panel.tsx";
import { PartsPanel } from "./parts-panel.tsx";
import { useSimulation } from "./sim/use-simulation.ts";
import { useProject } from "./use-project.ts";
import { Viewer3D } from "./view3d/viewer3d.tsx";

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return (
    !!t &&
    (t.tagName === "INPUT" ||
      t.tagName === "TEXTAREA" ||
      t.tagName === "SELECT" ||
      t.isContentEditable)
  );
};

export function App() {
  const project = useProject();
  const sim = useSimulation(project);
  const { loaded, issues, docJson, update } = project;
  const frame = sim.frame;
  const running = frame?.running ?? false;
  const [selection, setSelection] = useState<Selection | undefined>(undefined);
  const [adding, setAdding] = useState(false);
  const [coding, setCoding] = useState(false);
  const [view, setView] = useState<"2d" | "3d">("2d");
  const center = useRef(() => ({ x: 0, y: 0 }));

  const problems = [
    ...(issues.length ? [`검증 실패\n${formatIssues(issues)}`] : []),
    ...Object.entries(frame?.errors ?? {}).map(([id, m]) => `${id} 프로그램 오류: ${m}`),
    ...(sim.error ? [`시뮬레이션 오류: ${sim.error}`] : []),
  ];

  const removeSelected = () => {
    if (selection?.kind === "part") update(removeInstance(docJson, selection.id));
    if (selection?.kind === "wire") update(disconnect(docJson, selection.index));
    setSelection(undefined);
  };
  const rotateSelected = () => {
    if (selection?.kind === "part") update(rotateInstance(docJson, selection.id, center.current()));
  };

  // 키보드: Delete 삭제, R 회전, ⌘Z/⇧⌘Z 되돌리기, Esc 선택 해제, Space 실행/정지
  const keys = useRef({ removeSelected, rotateSelected, running, project, sim });
  keys.current = { removeSelected, rotateSelected, running, project, sim };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const k = keys.current;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) k.project.redo();
        else k.project.undo();
      } else if (e.key === "Delete" || e.key === "Backspace") k.removeSelected();
      else if (e.key === "r" || e.key === "R") k.rotateSelected();
      else if (e.key === "Escape") {
        setSelection(undefined);
        setAdding(false);
        setCoding(false);
      } else if (e.key === " ") {
        e.preventDefault();
        if (k.running) k.sim.pause();
        else k.sim.play();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main>
      {loaded && view === "3d" && (
        <Viewer3D loaded={loaded} selection={selection} onSelect={setSelection} />
      )}
      {loaded && view === "2d" && (
        <Canvas
          loaded={loaded}
          layout={loaded.doc.layout}
          live={frame && { signals: frame.signals, energized: new Set(frame.energized) }}
          selection={selection}
          onSelect={(s) => {
            setSelection(s);
            setAdding(false);
          }}
          onMove={(id, x, y) => update(moveInstance(docJson, id, x, y))}
          onConnect={(a, b) => update(connect(docJson, a, b))}
          onPress={sim.input}
          running={running}
          centerRef={center}
        />
      )}

      <div className="float" style={{ top: 16, left: 16 }}>
        <div className="pill">
          <strong>PhysiSim</strong>
          <span className="muted">/</span>
          <select
            className="bare"
            value={project.path ?? ""}
            onChange={(e) => project.open(e.target.value)}
          >
            {project.systems.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {project.compiling && <span className="muted">· 컴파일 중…</span>}
          <span className="muted">/</span>
          <span className="seg">
            <button
              type="button"
              className={view === "2d" ? "on" : ""}
              onClick={() => setView("2d")}
            >
              2D
            </button>
            <button
              type="button"
              className={view === "3d" ? "on" : ""}
              onClick={() => setView("3d")}
            >
              3D
            </button>
          </span>
        </div>
      </div>

      {loaded && (
        <div className="float tools">
          <button
            type="button"
            className="tool"
            onClick={() => {
              setAdding((a) => !a);
              setCoding(false);
            }}
          >
            <div className={`round${adding ? " active" : ""}`}>
              <PlusIcon />
            </div>
            <span>추가</span>
          </button>
          <button
            type="button"
            className="tool"
            onClick={() => {
              setCoding((c) => !c);
              setAdding(false);
            }}
          >
            <div className={`round${coding ? " active" : ""}`}>
              <CodeIcon />
            </div>
            <span>코드</span>
          </button>
        </div>
      )}
      {adding && loaded && (
        <PartsPanel
          registry={loaded.registry}
          onPick={(modelId) => {
            const { doc, id } = addInstance(docJson, modelId, center.current());
            update(doc);
            setSelection({ kind: "part", id });
            setAdding(false);
          }}
        />
      )}

      {coding && loaded && (
        <CodePanel
          loaded={loaded}
          files={project.refs}
          serial={frame?.serial ?? {}}
          onSave={(path, content) => project.saveFile(path, content)}
          onCreate={async (id) => {
            const path = `${id}.ino`;
            await project.saveFile(path, PROGRAM_TEMPLATE);
            update(setProgram(docJson, id, path));
          }}
          onClose={() => setCoding(false)}
        />
      )}

      {selection && (
        <div className="float selection-tools">
          {selection.kind === "part" && (
            <button type="button" className="round" onClick={rotateSelected} title="회전 (R)">
              <RotateIcon />
            </button>
          )}
          <button type="button" className="round" onClick={removeSelected} title="삭제 (Delete)">
            <TrashIcon />
          </button>
        </div>
      )}

      {loaded && selection?.kind === "part" && (
        <Inspector
          loaded={loaded}
          id={selection.id}
          signals={frame?.signals ?? {}}
          onChange={(key, value) => update(setProperty(docJson, selection.id, key, value))}
          onClose={() => setSelection(undefined)}
        />
      )}

      {loaded && (
        <div className="float transport">
          <button type="button" className="round" onClick={sim.reset} title="처음으로">
            <ResetIcon />
          </button>
          <button
            type="button"
            className={`round primary${running ? " active" : ""}`}
            onClick={running ? sim.pause : sim.play}
            title={running ? "일시정지 (Space)" : "실행 (Space)"}
          >
            {running ? <PauseIcon /> : <PlayIcon />}
          </button>
          <div className="pill time">{(frame?.time ?? 0).toFixed(2)} s</div>
        </div>
      )}

      {problems.length > 0 && (
        <div className="float panel issues" style={{ bottom: 16, left: 16 }}>
          {problems.join("\n\n")}
        </div>
      )}

      {!loaded && project.systems.length === 0 && (
        <div style={{ display: "grid", placeItems: "center", height: "100vh" }} className="muted">
          *.system.json 파일이 없다
        </div>
      )}
    </main>
  );
}
