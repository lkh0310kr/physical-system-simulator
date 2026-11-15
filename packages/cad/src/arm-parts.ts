/**
 * 로봇팔 출력 부품 생성기: 베이스·터릿·위팔·아래팔·손목 브래킷·그리퍼 손가락을 manifold로 만든다 (mm).
 * 좌표는 팔의 정지 자세(모든 관절 0: 팔이 위를 향함, +x 앞, +y 왼쪽, +z 위, 원점은 베이스 중심의 바닥)다.
 * 서보 몸체 치수는 제품 값(MG996R 데이터시트 40.7×19.7×42.9, SG92R Adafruit 23×11×29)이고,
 * **출력축 위치(shaftOffset)·혼 나사 구멍·고정 구멍은 제품 자료에서 확인하지 못한 가정**이라 실물을 재서 고쳐야 한다.
 * 서보는 출력축 쪽이 열린 포켓에 끼우고(포켓 = 몸체 + 여유), 케이블 타이 슬롯으로 고정하는 개념이다.
 */
import { box, cylinderAlong, loadGeometry, type Solid } from "./geometry.ts";

export interface ServoBody {
  readonly name: string;
  /** 몸체 길이(출력축이 길이 방향 한쪽에 치우쳐 있다)·폭·높이(출력축 방향). */
  readonly length: number;
  readonly width: number;
  readonly height: number;
  /** 출력축에서 가까운 쪽 끝까지 거리 (가정). */
  readonly shaftOffset: number;
}

export const MG996R_BODY: ServoBody = {
  name: "MG996R",
  length: 40.7,
  width: 19.7,
  height: 42.9,
  shaftOffset: 10,
};
export const SG92R_BODY: ServoBody = {
  name: "SG92R",
  length: 23,
  width: 11,
  height: 29,
  shaftOffset: 5.5,
};

export interface ArmPartsSpec {
  /** 바닥에서 어깨 축 높이. */
  readonly baseHeight: number;
  readonly link1: number;
  readonly link2: number;
  readonly gripper: number;
  /** 서보 포켓 여유(한 면당)와 벽 두께. */
  readonly clearance: number;
  readonly wall: number;
}

export const DEFAULT_ARM_SPEC: ArmPartsSpec = {
  baseHeight: 80,
  link1: 100,
  link2: 100,
  gripper: 60,
  clearance: 0.4,
  wall: 3,
};

export interface ArmPart {
  readonly name: string;
  readonly label: string;
  /** 정지 자세 좌표의 입체 (조립된 위치). */
  readonly solid: Solid;
  /** 출력 시 바닥에 놓을 면 (가장 넓은 면): 'z' 그대로, 'y'는 y축이 위로 가도록 눕힌다. */
  readonly printUp: "z" | "y";
  /** 이 부품이 쓰는 서보 이름들 (BOM). */
  readonly servos: readonly string[];
}

type Wasm = Awaited<ReturnType<typeof loadGeometry>>;

/** 출력축이 +y로 나오는 서보의 포켓(몸체 + 여유): 축 위치 (sx, sz), 출력면 y = yExit. 출력면 쪽은 `open`만큼 더 열어 둔다. */
function pocketY(
  m: Wasm,
  s: ServoBody,
  sx: number,
  sz: number,
  yExit: number,
  c: number,
  open = 6,
): Solid {
  return box(
    m,
    [sx - (s.length - s.shaftOffset) - c, yExit - s.height - c, sz - s.width / 2 - c],
    [sx + s.shaftOffset + c, yExit + open, sz + s.width / 2 + c],
  );
}

/** 혼 장착 구멍: 중심 Ø7과 Ø14 원 위 4개 Ø2.2 (표준 서보 혼 형태를 가정). y 방향 관통. */
function hornHolesY(m: Wasm, x: number, z: number, y0: number, y1: number): Solid[] {
  const holes = [cylinderAlong(m, 1, y0, y1, [x, z], 7)];
  for (const [dx, dz] of [
    [7, 0],
    [-7, 0],
    [0, 7],
    [0, -7],
  ] as const) {
    holes.push(cylinderAlong(m, 1, y0, y1, [x + dx, z + dz], 2.2));
  }
  return holes;
}

const subtractAll = (s: Solid, cutters: readonly Solid[]) =>
  cutters.reduce((acc, c) => acc.subtract(c), s);

export async function buildArmParts(spec: ArmPartsSpec = DEFAULT_ARM_SPEC): Promise<ArmPart[]> {
  const m = await loadGeometry();
  const c = spec.clearance;
  const w = spec.wall;
  const z2 = spec.baseHeight; // 어깨 축
  const z3 = z2 + spec.link1; // 팔꿈치 축
  const z4 = z3 + spec.link2; // 손목 축

  // ── 베이스: 판 + 받침대(J1 서보 SG92R를 위로 끼움, 출력축 +z) ──
  const sg = SG92R_BODY;
  const plate = box(m, [-55, -55, 0], [55, 55, 6]);
  const pedestal = box(
    m,
    [-sg.length + sg.shaftOffset - w - c, -sg.width / 2 - w - c, 6],
    [sg.shaftOffset + w + c, sg.width / 2 + w + c, 32],
  );
  const j1Pocket = box(
    m,
    [-(sg.length - sg.shaftOffset) - c, -sg.width / 2 - c, 6],
    [sg.shaftOffset + c, sg.width / 2 + c, 40],
  );
  const feet = [
    [-45, -45],
    [45, -45],
    [-45, 45],
    [45, 45],
  ].map(([x, y]) => cylinderAlong(m, 2, -1, 8, [x as number, y as number], 4.2));
  const base = subtractAll(plate.add(pedestal), [j1Pocket, ...feet]);

  // ── 터릿: 혼 원판(J1 혼, z 36~42) + 기둥 + J2 포켓(MG996R, 출력축 +y, 높이 z2) ──
  const big = MG996R_BODY;
  const tx0 = -(big.length - big.shaftOffset) - c - w;
  const tx1 = big.shaftOffset + c + w;
  const yFace = 24;
  const disc = cylinderAlong(m, 2, 36, 42, [0, 0], 56);
  const column = box(m, [tx0, -22, 42], [tx1, yFace, z2 + big.width / 2 + c + w]);
  const discHoles = [
    cylinderAlong(m, 2, 35, 43, [0, 0], 7),
    ...[
      [7, 0],
      [-7, 0],
      [0, 7],
      [0, -7],
    ].map(([x, y]) => cylinderAlong(m, 2, 35, 43, [x as number, y as number], 2.2)),
  ];
  const j2Pocket = pocketY(m, big, 0, z2, yFace, c);
  const tieSlots = [-12, 12].map((dx) => box(m, [dx - 1.5, -30, z2 - 30], [dx + 1.5, 30, z2 + 30]));
  const turret = subtractAll(disc.add(column), [...discHoles, j2Pocket, ...tieSlots]);

  // ── 위팔: J2 혼 판(y 27~33) + 보 + J3 포켓(MG996R, 출력축 +y, 팔꿈치 높이) ──
  const yArm = 27;
  const armPlate = box(m, [-11, yArm, z2 - 11], [11, yArm + 6, z3 + 1]);
  const elbowBlock = box(
    m,
    [tx0, yArm + 6 - big.height - c - w, z3 - big.width / 2 - c - w],
    [tx1, yArm + 6, z3 + big.width / 2 + c + w],
  );
  const elbowPocket = pocketY(m, big, 0, z3, yArm + 6, c);
  const upper = subtractAll(armPlate.add(elbowBlock), [
    ...hornHolesY(m, 0, z2, yArm - 1, yArm + 7),
    elbowPocket,
  ]);

  // ── 아래팔: J3 혼 판(y 이어서) + 보 + J4 포켓(SG92R 손목) ──
  const yFore = yArm + 6 + 3;
  const forePlate = box(m, [-10, yFore, z3 - 10], [10, yFore + 6, z4 + 1]);
  const wristBlock = box(
    m,
    [
      -(sg.length - sg.shaftOffset) - c - w,
      yFore + 6 - sg.height - c - w,
      z4 - sg.width / 2 - c - w,
    ],
    [sg.shaftOffset + c + w, yFore + 6, z4 + sg.width / 2 + c + w],
  );
  const wristPocket = pocketY(m, sg, 0, z4, yFore + 6, c);
  const fore = subtractAll(forePlate.add(wristBlock), [
    ...hornHolesY(m, 0, z3, yFore - 1, yFore + 7),
    wristPocket,
  ]);

  // ── 손목 브래킷: J4 혼 판 + 앞으로 뻗은 그리퍼 몸체(SG92R 그리퍼 서보 세로 장착, 출력축 +z, 고정 손가락) ──
  const yWrist = yFore + 6 + 3;
  const gx = 12; // 그리퍼 서보 출력축 x
  const gy = yWrist + 3 + sg.width / 2 + c; // 출력축 y
  const halfH = sg.height / 2;
  const wristPlate = box(m, [-10, yWrist, z4 - 10], [10, yWrist + 6, z4 + 10]);
  const gripBody = box(
    m,
    [0, yWrist, z4 - halfH - c - w],
    [spec.gripper - 6, yWrist + 3 + sg.width + 2 * c + w, z4 + halfH + c + w],
  );
  const gripServoPocket = box(
    m,
    [gx - (sg.length - sg.shaftOffset) - c, gy - sg.width / 2 - c, z4 - halfH - c],
    [gx + sg.shaftOffset + c, gy + sg.width / 2 + c, z4 + halfH + c + w + 1],
  );
  const fixedFinger = box(
    m,
    [spec.gripper - 26, yWrist + 3 + sg.width + c, z4 - 4],
    [spec.gripper + 2, yWrist + 3 + sg.width + c + 6, z4 + 4],
  );
  const wristBracket = subtractAll(wristPlate.add(gripBody).add(fixedFinger), [
    ...hornHolesY(m, 0, z4, yWrist - 1, yWrist + 7),
    gripServoPocket,
  ]);

  // ── 움직이는 손가락: 그리퍼 서보 혼(출력축 위)에 끼우는 막대. 정지 자세(열림)로 조립 위치에 둔다 ──
  const fz = z4 + halfH + c + w + 1;
  const finger = subtractAll(box(m, [gx - 8, gy - 6, fz], [gx + 34, gy + 6, fz + 8]), [
    cylinderAlong(m, 2, fz - 1, fz + 9, [gx, gy], 7),
  ]);

  return [
    { name: "base", label: "베이스 판 + J1 받침", solid: base, printUp: "z", servos: ["SG92R"] },
    {
      name: "turret",
      label: "터릿(J1 혼 원판 + J2 포켓)",
      solid: turret,
      printUp: "z",
      servos: ["MG996R"],
    },
    {
      name: "upper-arm",
      label: "위팔(J2 혼 판 + J3 포켓)",
      solid: upper,
      printUp: "y",
      servos: ["MG996R"],
    },
    {
      name: "forearm",
      label: "아래팔(J3 혼 판 + J4 포켓)",
      solid: fore,
      printUp: "y",
      servos: ["SG92R"],
    },
    {
      name: "wrist-bracket",
      label: "손목 브래킷(J4 혼 판 + 그리퍼 서보 포켓 + 고정 손가락)",
      solid: wristBracket,
      printUp: "y",
      servos: ["SG92R"],
    },
    { name: "finger", label: "움직이는 손가락", solid: finger, printUp: "y", servos: [] },
  ];
}

export interface ArmServo {
  readonly joint: "J1" | "J2" | "J3" | "J4" | "J5";
  readonly body: ServoBody;
  /** 정지 자세 좌표의 서보 몸체 상자 (간섭 검사·표시용). */
  readonly solid: Solid;
}

/** 부품 안에 끼워지는 서보 5개의 몸체 상자. 포켓과 같은 기준으로 놓는다. */
export async function armServos(spec: ArmPartsSpec = DEFAULT_ARM_SPEC): Promise<ArmServo[]> {
  const m = await loadGeometry();
  const z2 = spec.baseHeight;
  const z3 = z2 + spec.link1;
  const z4 = z3 + spec.link2;
  const big = MG996R_BODY;
  const sg = SG92R_BODY;
  const alongY = (s: ServoBody, yExit: number, z: number) =>
    box(
      m,
      [-(s.length - s.shaftOffset), yExit - s.height, z - s.width / 2],
      [s.shaftOffset, yExit, z + s.width / 2],
    );
  const yArm = 27;
  const yFore = yArm + 6 + 3;
  const yWrist = yFore + 6 + 3;
  const gx = 12;
  const gy = yWrist + 3 + sg.width / 2 + spec.clearance;
  return [
    {
      joint: "J1",
      body: sg,
      solid: box(
        m,
        [-(sg.length - sg.shaftOffset), -sg.width / 2, 6],
        [sg.shaftOffset, sg.width / 2, 6 + sg.height],
      ),
    },
    { joint: "J2", body: big, solid: alongY(big, 24, z2) },
    { joint: "J3", body: big, solid: alongY(big, yArm + 6, z3) },
    { joint: "J4", body: sg, solid: alongY(sg, yFore + 6, z4) },
    {
      joint: "J5",
      body: sg,
      solid: box(
        m,
        [gx - (sg.length - sg.shaftOffset), gy - sg.width / 2, z4 - sg.height / 2],
        [gx + sg.shaftOffset, gy + sg.width / 2, z4 + sg.height / 2],
      ),
    },
  ];
}

import { type Mesh, meshOf } from "./geometry.ts";

/** 출력 자세로 만든 메시: `printUp`이 y인 부품은 y가 위로 가도록 눕히고, 바닥(z=0)에 놓은 뒤 x로 나란히 배치한다. */
export function printLayoutOfArm(
  parts: readonly ArmPart[],
  gap = 10,
): { name: string; mesh: Mesh }[] {
  let cursor = 0;
  return parts.map((p) => {
    let s = p.printUp === "y" ? p.solid.rotate([90, 0, 0]) : p.solid;
    const b = s.boundingBox();
    s = s.translate([cursor - b.min[0], -b.min[1], -b.min[2]]);
    cursor += b.max[0] - b.min[0] + gap;
    return { name: p.name, mesh: meshOf(s) };
  });
}

/** 3D 뷰어용: 정지 자세 좌표(mm)를 모델 body 좌표(m, 중심 = (0, 0, centerZ mm))로 옮긴 메시. */
export function bodyFrameMesh(part: ArmPart, centerZ: number): Mesh {
  const mesh = meshOf(part.solid);
  const positions = new Float32Array(mesh.positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (mesh.positions[i] ?? 0) / 1000;
    positions[i + 1] = (mesh.positions[i + 1] ?? 0) / 1000;
    positions[i + 2] = ((mesh.positions[i + 2] ?? 0) - centerZ) / 1000;
  }
  return { positions, indices: mesh.indices };
}
