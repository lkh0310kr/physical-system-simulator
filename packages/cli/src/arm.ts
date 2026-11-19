/** `physisim arm`: 로봇팔 설계 해석과 실제 하드웨어용 Serial 줄 생성. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  armServos,
  bodyFrameMesh,
  buildArmParts,
  DEFAULT_ARM_SPEC,
  inspect,
  printLayoutOfArm,
  write3mf,
  writeGlb,
  writeStl,
} from "@physisim/cad";
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

export interface ArmPartsOutput {
  readonly files: readonly string[];
  readonly summary: string;
}

/**
 * 출력 가능한 팔 부품을 생성해 STL(부품별)·3MF(한 판)·BOM을 쓴다. `glbDir`가 있으면 3D 뷰어용 glb도 쓴다.
 * 서보 몸체와 간섭하는 부품이 있으면 아무것도 쓰지 않고 실패한다.
 */
export async function writeArmParts(outDir: string, glbDir?: string): Promise<ArmPartsOutput> {
  const parts = await buildArmParts(DEFAULT_ARM_SPEC);
  const servos = await armServos(DEFAULT_ARM_SPEC);
  const problems: string[] = [];
  for (const p of parts) {
    const r = inspect(p.solid);
    if (!r.closed || r.components !== 1)
      problems.push(`${p.name}: 닫힌 한 덩어리가 아니다 (${r.status}, ${r.components}조각)`);
    for (const sv of servos) {
      const v = p.solid.intersect(sv.solid).volume();
      if (v > 1e-6) problems.push(`${p.name}가 ${sv.joint} 서보와 ${v.toFixed(1)} mm³ 겹친다`);
    }
  }
  if (problems.length)
    return { files: [], summary: `✗ 검증 실패 — 파일을 쓰지 않았다\n  ${problems.join("\n  ")}` };
  mkdirSync(outDir, { recursive: true });
  const layout = printLayoutOfArm(parts);
  const files: string[] = [];
  for (const l of layout) {
    const path = join(outDir, `arm-${l.name}.stl`);
    writeFileSync(path, writeStl(l.mesh, `arm ${l.name}`));
    files.push(path);
  }
  const threemf = join(outDir, "arm-parts.3mf");
  writeFileSync(threemf, write3mf(layout.map((l) => ({ name: l.name, mesh: l.mesh }))));
  files.push(threemf);
  const volumeCm3 = parts.reduce((s, p) => s + inspect(p.solid).volume, 0) / 1000;
  const bom = [
    "수량,품명,비고",
    "2,MG996R 서보 (Tower Pro),어깨·팔꿈치 — 정지 토크 9.4 kgf·cm (4.8 V) / 11 (6 V)",
    "3,SG92R 서보 (Adafruit 169),베이스·손목·그리퍼 — 또는 SG90/MG90S급",
    "1,PCA9685 16채널 서보 드라이버 (Adafruit 815),I2C 주소 기본값은 보드 설명서로 확인",
    "1,Arduino Uno Rev3 (A000066),Serial 115200, 펌웨어 examples/robot-arm-firmware",
    "1,외부 5~6 V 3 A 이상 전원,서보 전용 — Uno 5 V 핀으로 구동 금지, GND 공통",
    "1,1000 µF 이상 전해 커패시터,서보 전원 평활 (PCA9685 V+ 근처, 권장)",
    "약 20,M3 나사·너트·케이블 타이,서보 고정과 혼 체결 (수량은 가정 — 실물에 맞춰 확인)",
    `1세트,3D 프린트 부품 6개 (PLA 약 ${(volumeCm3 * 1.24 * 0.4).toFixed(0)} g 가정),충전율 40% 가정`,
  ];
  const bomPath = join(outDir, "arm-bom.csv");
  writeFileSync(bomPath, `${bom.join("\n")}\n`);
  files.push(bomPath);
  if (glbDir) {
    mkdirSync(glbDir, { recursive: true });
    for (const p of parts) {
      const path = join(glbDir, `arm-${p.name}.glb`);
      writeFileSync(path, writeGlb(bodyFrameMesh(p, 150)));
      files.push(path);
    }
  }
  const lines = parts.map((p) => {
    const r = inspect(p.solid);
    return `  ${p.name.padEnd(14)} ${[0, 1, 2].map((i) => ((r.max[i] ?? 0) - (r.min[i] ?? 0)).toFixed(0)).join(" × ")} mm  ${(r.volume / 1000).toFixed(1)} cm³  ${p.label}`;
  });
  return {
    files,
    summary: [
      "✓ 로봇팔 부품 (서보 포켓 검증 통과: 몸체와 겹침 없음, 모두 닫힌 한 덩어리)",
      ...lines,
      "",
      "미확인(실물로 확인·보정): 서보 출력축 위치, 혼 나사 구멍 배치, 서보 고정 방식(케이블 타이 슬롯 가정)",
      ...files.map((f) => `  ${f}`),
    ].join("\n"),
  };
}
