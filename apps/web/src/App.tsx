import { formatIssues } from "@physisim/core";
import { Canvas } from "./canvas/Canvas.tsx";
import { PauseIcon, PlayIcon, ResetIcon } from "./icons.tsx";
import { useSimulation } from "./sim/use-simulation.ts";
import { useProject } from "./use-project.ts";

export function App() {
  const project = useProject();
  const sim = useSimulation(project);
  const { loaded, issues } = project;
  const frame = sim.frame;
  const running = frame?.running ?? false;
  const problems = [
    ...(issues.length ? [`검증 실패\n${formatIssues(issues)}`] : []),
    ...Object.entries(frame?.errors ?? {}).map(([id, m]) => `${id} 프로그램 오류: ${m}`),
    ...(sim.error ? [`시뮬레이션 오류: ${sim.error}`] : []),
  ];

  return (
    <main>
      {loaded && (
        <Canvas
          loaded={loaded}
          layout={loaded.doc.layout}
          live={frame && { signals: frame.signals, energized: new Set(frame.energized) }}
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
        </div>
      </div>

      {loaded && (
        <div className="float transport">
          <button type="button" className="round" onClick={sim.reset} title="처음으로">
            <ResetIcon />
          </button>
          <button
            type="button"
            className={`round primary${running ? " active" : ""}`}
            onClick={running ? sim.pause : sim.play}
            title={running ? "일시정지" : "실행"}
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
