import { formatIssues } from "@physisim/core";
import { useProject } from "./use-project.ts";

export function App() {
  const project = useProject();
  const { loaded, issues } = project;

  return (
    <main>
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

      {issues.length > 0 && (
        <div className="float panel issues" style={{ bottom: 16, left: 16 }}>
          <b>검증 실패</b>
          {"\n"}
          {formatIssues(issues)}
        </div>
      )}

      <div style={{ display: "grid", placeItems: "center", height: "100vh" }} className="muted">
        {loaded
          ? `${loaded.doc.name} — 부품 ${loaded.system.instances.length}개, Net ${loaded.system.nets.length}개`
          : project.systems.length === 0
            ? "*.system.json 파일이 없다"
            : ""}
      </div>
    </main>
  );
}
