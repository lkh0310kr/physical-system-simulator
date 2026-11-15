/** `physisim arm`: 로봇팔 설계 해석과 실제 하드웨어용 Serial 줄 생성. */
import { readFileSync } from "node:fs";
import {
  compileScript,
  coverage,
  DERATE,
  MG996R,
  RECOMMENDED,
  recommend,
  recommendedWindows,
  torques,
} from "@physisim/models";

const deg = (r: number) => Math.round((r * 180) / Math.PI);

/** 링크 길이 후보 표와 추천 (설계 해석). */
export function armDesignReport(): string {
  const { workspace: ws, design } = RECOMMENDED;
  const r = recommend(ws, design.payload);
  const lines = [
    `로봇팔 설계 해석 — 하중 ${design.payload * 1000} g, 작업 영역 반경 ${ws.rMin * 1000}~${ws.rMax * 1000} mm · 끝점 높이 ${ws.zMin * 1000}~${ws.zMax * 1000} mm · 방위 ±${deg(ws.azimuth)}°`,
    `서보: 어깨·팔꿈치 ${MG996R.name}(정지 ${(MG996R.stallTorque * 10.197).toFixed(1)} kgf·cm @6 V, 가동 ±${deg(MG996R.range / 2)}°), 나머지 SG92R(±90°)`,
    "",
    "링크   영역 덮음   장착 오프셋(어깨/팔꿈치/손목)   어깨 토크   안전율(정지)   안전율(정지의 50%)",
  ];
  for (const c of r.candidates) {
    lines.push(
      `${String(c.design.link1 * 1000).padEnd(5)}  ${(c.coverage * 100).toFixed(0).padStart(4)} %      ${[c.offsets.shoulder, c.offsets.elbow, c.offsets.wrist].map(deg).join("°/")}°`.padEnd(
        66,
      ) +
        `${c.torque.shoulder.toFixed(3)} N·m   ${c.torque.shoulderMargin.toFixed(2)}        ${c.torque.shoulderDerated.toFixed(2)}`,
    );
  }
  const t = torques(design);
  lines.push(
    "",
    r.best
      ? `추천: 링크 ${r.best.design.link1 * 1000}/${r.best.design.link2 * 1000} mm, 어깨 높이 ${design.baseHeight * 1000} mm, 그리퍼 ${design.gripper * 1000} mm, 서보 장착 오프셋 어깨 ${deg(r.best.offsets.shoulder)}°·팔꿈치 ${deg(r.best.offsets.elbow)}°·손목 ${deg(r.best.offsets.wrist)}° (영역을 모두 덮는 후보 중 토크 여유가 가장 큼)`
      : "추천: 작업 영역을 모두 덮는 후보가 없다 — 링크를 늘리거나 영역을 줄인다",
    `확정 설계의 영역 덮음 ${(coverage({ baseHeight: design.baseHeight, link1: design.link1, link2: design.link2, gripper: design.gripper }, recommendedWindows(), ws, 8) * 100).toFixed(0)} %, 팔을 수평으로 편 자세의 어깨 토크 ${t.shoulder.toFixed(3)} N·m (허용 ${(MG996R.stallTorque * DERATE).toFixed(3)} N·m), 팔 질량 약 ${(t.totalMass * 1000).toFixed(0)} g`,
    "가정: 링크는 PLA 판(22×12 mm 단면, 실효 충전 40 %), 그리퍼 서보 + 출력물 21 g, 정적 토크만 (가속·진동 여유는 안전율로 본다)",
  );
  return lines.join("\n");
}

/** 스크립트를 실제 하드웨어에 보낼 Serial 줄로 컴파일한다. WAIT/DWELL은 주석 줄로 남긴다. */
export function armLines(scriptPath: string): { text: string; errors: string[] } {
  const compiled = compileScript(readFileSync(scriptPath, "utf8"), {
    geometry: {
      baseHeight: RECOMMENDED.design.baseHeight,
      link1: RECOMMENDED.design.link1,
      link2: RECOMMENDED.design.link2,
      gripper: RECOMMENDED.design.gripper,
    },
    windows: recommendedWindows(),
    offsets: RECOMMENDED.offsets,
  });
  const out = compiled.steps.map((s) =>
    s.kind === "send"
      ? s.line
      : s.kind === "wait"
        ? "# WAIT — STATUS가 MOVING 0을 돌려줄 때까지 기다린다"
        : `# DWELL ${s.seconds}`,
  );
  return { text: out.join("\n"), errors: compiled.errors.map((e) => `${e.line}행: ${e.message}`) };
}
