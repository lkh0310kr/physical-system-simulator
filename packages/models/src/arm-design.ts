/**
 * 로봇팔 설계 해석 (순수 함수, SI): 링크 길이·서보 장착 오프셋을 골라 보고, 정적 토크 여유와 작업 영역 도달 가능성을 계산한다.
 * 추천은 "요구 작업 영역을 전부 덮고(오프셋 포함), 어깨 토크 안전율이 가장 큰" 후보다. 질량·치수의 가정은 상수로 모아 두었다.
 */
import {
  type ArmGeometry,
  forward,
  inverse,
  type JointWindows,
  type Point3,
} from "./arm-kinematics.ts";

const G = 9.81;
const DEG = Math.PI / 180;

/** 서보 사양: 토크는 제품 데이터시트(6 V) 값, 질량·가동 각도는 제품 페이지/데이터시트 값. */
export interface ServoSpec {
  readonly name: string;
  /** 정지 토크 [N·m]. */
  readonly stallTorque: number;
  readonly mass: number;
  /** 총 가동 각도 [rad]. */
  readonly range: number;
}

/** MG996R (Tower Pro 데이터시트): 11 kgf·cm @6 V, 55 g, 약 120° (좌우 60°). */
export const MG996R: ServoSpec = {
  name: "MG996R",
  stallTorque: 11 * 0.0980665,
  mass: 0.055,
  range: 120 * DEG,
};
/** SG92R (Adafruit 169): 2.5 kg·cm (정격 4.8 V), 9 g, 약 180° (좌우 90°). */
export const SG92R: ServoSpec = {
  name: "SG92R",
  stallTorque: 2.5 * 0.0980665,
  mass: 0.009,
  range: 180 * DEG,
};

/** 출력 한계: 연속 사용은 정지 토크의 이 비율까지만 (일반적인 서보 사용 지침, 가정). */
export const DERATE = 0.5;
/** PLA 밀도 [kg/m³]와 출력물의 실효 충전 비율(벽 + 20% 충전, 가정). */
const PLA_DENSITY = 1240;
const PRINT_FILL = 0.4;

export interface ArmDesign {
  readonly baseHeight: number;
  readonly link1: number;
  readonly link2: number;
  readonly gripper: number;
  /** 최대 하중(집는 물체) [kg]. */
  readonly payload: number;
}

/** 링크 하나의 질량: 판 모양 단면(폭×두께)을 길이만큼 출력한다고 본 값. */
const linkMass = (length: number, width = 0.022, thickness = 0.012) =>
  length * width * thickness * PLA_DENSITY * PRINT_FILL;

export interface TorqueReport {
  /** 어깨가 수평으로 쭉 편 자세에서 받는 정적 토크 [N·m]. */
  readonly shoulder: number;
  readonly elbow: number;
  /** 서보 정지 토크 대비 안전율(정지 토크 / 필요 토크). */
  readonly shoulderMargin: number;
  readonly elbowMargin: number;
  /** DERATE를 적용한 허용 토크로 본 안전율. */
  readonly shoulderDerated: number;
  readonly elbowDerated: number;
  readonly totalMass: number;
}

/**
 * 가장 불리한 자세(팔을 수평으로 완전히 편 상태)의 정적 토크.
 * 어깨: 위팔 + 팔꿈치 서보(MG996R) + 아래팔 + 손목 서보 + 그리퍼(서보+출력물) + 하중.
 * 팔꿈치: 아래팔 + 손목 서보 + 그리퍼 + 하중.
 */
export function torques(
  d: ArmDesign,
  elbowServo = MG996R,
  wristServo = SG92R,
  gripperServo = SG92R,
): TorqueReport {
  const mUpper = linkMass(d.link1);
  const mFore = linkMass(d.link2);
  const mGrip = gripperServo.mass + 0.012; // 서보 + 그리퍼 출력물(가정)
  const tipArm = d.link1 + d.link2 + d.gripper / 2;
  const elbowTorque =
    G *
    (mFore * (d.link2 / 2) +
      wristServo.mass * d.link2 +
      mGrip * (d.link2 + d.gripper / 2) +
      d.payload * (d.link2 + d.gripper));
  const shoulderTorque =
    G *
    (mUpper * (d.link1 / 2) +
      elbowServo.mass * d.link1 +
      mFore * (d.link1 + d.link2 / 2) +
      wristServo.mass * (d.link1 + d.link2) +
      mGrip * (d.link1 + tipArm - d.link1) +
      d.payload * (d.link1 + d.link2 + d.gripper));
  return {
    shoulder: shoulderTorque,
    elbow: elbowTorque,
    shoulderMargin: MG996R.stallTorque / shoulderTorque,
    elbowMargin: MG996R.stallTorque / elbowTorque,
    shoulderDerated: (MG996R.stallTorque * DERATE) / shoulderTorque,
    elbowDerated: (MG996R.stallTorque * DERATE) / elbowTorque,
    totalMass: mUpper + mFore + elbowServo.mass * 2 + wristServo.mass + mGrip,
  };
}

/** 팔이 닿아야 하는 작업 영역: 베이스 기준 반경·높이·방위각 범위 (끝점 기준, 그리퍼 수직 아래). */
export interface Workspace {
  readonly rMin: number;
  readonly rMax: number;
  readonly zMin: number;
  readonly zMax: number;
  /** 방위각 ± [rad]. */
  readonly azimuth: number;
}

/** 요구 작업 영역을 격자로 훑어 IK가 허용 구간 안에서 풀리는 비율 (0~1). */
export function coverage(g: ArmGeometry, windows: JointWindows, ws: Workspace, steps = 6): number {
  let ok = 0;
  let total = 0;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      for (let k = 0; k <= 4; k++) {
        const r = ws.rMin + ((ws.rMax - ws.rMin) * i) / steps;
        const z = ws.zMin + ((ws.zMax - ws.zMin) * j) / steps;
        const az = -ws.azimuth + (2 * ws.azimuth * k) / 4;
        const target: Point3 = { x: r * Math.cos(az), y: r * Math.sin(az), z };
        total++;
        if (inverse(g, target, windows).reachable) ok++;
      }
    }
  }
  return ok / total;
}

/** 서보 가동 범위(range)를 중심 오프셋 `center`로 옮긴 관절 구간. */
export const windowAround = (center: number, servo: ServoSpec): readonly [number, number] => [
  center - servo.range / 2,
  center + servo.range / 2,
];

export interface Candidate {
  readonly design: ArmDesign;
  readonly offsets: { readonly shoulder: number; readonly elbow: number; readonly wrist: number };
  readonly coverage: number;
  readonly torque: TorqueReport;
}

/** 가장 넓게 덮는 장착 오프셋(5° 격자)을 찾는다. 베이스는 SG92R ±90° 중앙 고정. */
export function bestOffsets(g: ArmGeometry, ws: Workspace, bigServo = MG996R, smallServo = SG92R) {
  let best: { offsets: Candidate["offsets"]; coverage: number } | undefined;
  for (let s = -20; s <= 100; s += 5) {
    for (let e = -20; e <= 100; e += 5) {
      for (let w = -90; w <= 90; w += 10) {
        const windows: JointWindows = {
          base: [-smallServo.range / 2, smallServo.range / 2],
          shoulder: windowAround(s * DEG, bigServo),
          elbow: windowAround(e * DEG, bigServo),
          wrist: windowAround(w * DEG, smallServo),
        };
        const c = coverage(g, windows, ws, 4);
        if (!best || c > best.coverage)
          best = { offsets: { shoulder: s * DEG, elbow: e * DEG, wrist: w * DEG }, coverage: c };
      }
    }
  }
  if (!best) throw new Error("오프셋 탐색 실패");
  return best;
}

/** 링크 길이 후보들을 평가하고, 작업 영역을 전부 덮는 후보 중 어깨 토크 여유가 가장 큰 것을 추천한다. */
export function recommend(
  ws: Workspace,
  payload: number,
  lengths: readonly number[] = [0.09, 0.1, 0.11, 0.12, 0.13],
  fixed: { baseHeight: number; gripper: number } = { baseHeight: 0.08, gripper: 0.06 },
): { candidates: Candidate[]; best: Candidate | undefined } {
  const candidates = lengths.map((len) => {
    const design: ArmDesign = { ...fixed, link1: len, link2: len, payload };
    const { offsets, coverage: cov } = bestOffsets(design, ws);
    return { design, offsets, coverage: cov, torque: torques(design) };
  });
  const full = candidates.filter((c) => c.coverage >= 0.999);
  const best = [...full].sort((a, b) => b.torque.shoulderDerated - a.torque.shoulderDerated)[0];
  return { candidates, best };
}

export { forward };

/**
 * 추천 설계 (2026-11-16 해석 결과, `recommend`로 재현된다): 링크 100/100 mm, 어깨 높이 80 mm, 그리퍼 60 mm, 하중 50 g.
 * 서보 혼 장착 오프셋 — 어깨 +5°, 팔꿈치 +60°, 손목 −90° (MG996R 120°·SG92R 180° 가동 범위를 작업 영역에 맞춰 옮김).
 */
export const RECOMMENDED = {
  design: {
    baseHeight: 0.08,
    link1: 0.1,
    link2: 0.1,
    gripper: 0.06,
    payload: 0.05,
  } satisfies ArmDesign,
  offsets: { shoulder: 5 * DEG, elbow: 60 * DEG, wrist: -90 * DEG },
  /** 요구 작업 영역: 반경 100~180 mm, 끝점 높이 20~80 mm, 방위각 ±60°. */
  workspace: {
    rMin: 0.1,
    rMax: 0.18,
    zMin: 0.02,
    zMax: 0.08,
    azimuth: 60 * DEG,
  } satisfies Workspace,
} as const;

/** 추천 오프셋과 서보 가동 범위로 만든 관절 허용 구간. */
export function recommendedWindows(): JointWindows {
  const o = RECOMMENDED.offsets;
  return {
    base: [-SG92R.range / 2, SG92R.range / 2],
    shoulder: windowAround(o.shoulder, MG996R),
    elbow: windowAround(o.elbow, MG996R),
    wrist: windowAround(o.wrist, SG92R),
  };
}
