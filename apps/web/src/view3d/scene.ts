/**
 * 3D 장면 데이터 (순수 함수): 로드된 System → 렌더할 박스 목록.
 * body가 있으면 실치수 박스, 없으면 "자동 박스"(자리표시, 치수는 가정)로 표시한다 — 가정을 실물처럼 보이게 하지 않는다.
 */
import {
  bodySize,
  type LoadedSystem,
  type MaterialKind,
  placementPosition,
  toMeters,
  type Vec3,
} from "@physisim/core";

/** body가 없는 부품의 자리표시 크기 [m]. 실제 치수가 아니다. */
export const PLACEHOLDER_SIZE: Vec3 = [0.01, 0.01, 0.004];
/** 자동 배치 간격 [m]. */
const GAP = 0.005;

/** 부품 안의 세부 형상 (body 중심 기준 [m]). 박스 또는 축 방향 원기둥. */
/** 신호를 따라 움직이는 방식 (거리는 m). */
export type SceneMotion =
  | {
      readonly kind: "translate";
      readonly signal: string;
      readonly axis: "x" | "y" | "z";
      readonly distance: number;
    }
  | {
      readonly kind: "rotate";
      readonly signal: string;
      readonly axis: "x" | "y" | "z";
      readonly scale: number;
      /** 회전 중심 [m] (없으면 형상 중심). */
      readonly pivot: Vec3 | undefined;
    };

export type ScenePart =
  | {
      readonly kind: "box";
      readonly name: string;
      readonly position: Vec3;
      readonly size: Vec3;
      readonly material: MaterialKind;
      readonly color: string | undefined;
      readonly motions: readonly SceneMotion[];
    }
  | {
      readonly kind: "cylinder";
      readonly name: string;
      readonly position: Vec3;
      readonly diameter: number;
      readonly length: number;
      readonly axis: "x" | "y" | "z";
      readonly material: MaterialKind;
      readonly color: string | undefined;
      readonly motions: readonly SceneMotion[];
    };

export interface SceneBox {
  readonly id: string;
  readonly model: string;
  /** 중심 위치 [m]. */
  readonly position: Vec3;
  /** x·y·z 회전 [도]. */
  readonly rotation: Vec3;
  /** 크기 [m]. */
  readonly size: Vec3;
  /** 사람이 누르는 스위치 부품인지 (3D에서 클릭으로 조작). */
  readonly switchable: boolean;
  /** 실치수(body 선언)인지, 자리표시인지. */
  readonly real: boolean;
  readonly color: string | undefined;
  /** 제작사 CAD에서 변환한 메시 URL. 없거나 불러오지 못하면 `parts`로 그린다. */
  readonly mesh: string | undefined;
  /** 세부 형상. 비어 있으면 박스 하나로 그린다. */
  readonly parts: readonly ScenePart[];
}

const motionOf = (
  m:
    | { signal: string; axis: "x" | "y" | "z"; distance: number | string }
    | {
        signal: string;
        axis: "x" | "y" | "z";
        rotate: true;
        scale: number;
        pivot?: readonly [number | string, number | string, number | string] | undefined;
      }
    | undefined,
): SceneMotion | undefined => {
  if (!m) return undefined;
  if ("rotate" in m)
    return {
      kind: "rotate",
      signal: m.signal,
      axis: m.axis,
      scale: m.scale,
      pivot: m.pivot ? v3(m.pivot) : undefined,
    };
  return { kind: "translate", signal: m.signal, axis: m.axis, distance: toMeters(m.distance) };
};

type MotionInput = Parameters<typeof motionOf>[0];
const motionsOf = (m: MotionInput | NonNullable<MotionInput>[] | undefined): SceneMotion[] =>
  (Array.isArray(m) ? m : [m]).flatMap((x) => {
    const v = motionOf(x);
    return v ? [v] : [];
  });

const v3 = (v: readonly [number | string, number | string, number | string]): Vec3 => [
  toMeters(v[0]),
  toMeters(v[1]),
  toMeters(v[2]),
];

export function buildScene3d(loaded: LoadedSystem): SceneBox[] {
  const assembly = loaded.doc.assembly ?? {};
  let cursor = 0; // 배치가 없는 부품은 x축으로 나란히 놓는다
  return loaded.system.instances.map((inst) => {
    const model = loaded.registry.getModel(inst.model);
    const body = model?.body;
    const size: Vec3 = body ? bodySize(body) : PLACEHOLDER_SIZE;
    const placed = assembly[inst.id];
    let position: Vec3;
    if (placed) {
      position = placementPosition(placed);
    } else {
      position = [cursor + size[0] / 2, 0, size[2] / 2];
      cursor += size[0] + GAP;
    }
    const rotation = (placed?.rotation ?? [0, 0, 0]) as Vec3;
    const switchable = !!model?.capabilities.some((c) => c.capability === "capability.switching");
    return {
      id: inst.id,
      model: inst.model,
      position,
      rotation,
      size,
      switchable,
      real: !!body,
      color: body?.color,
      mesh: body?.mesh ? `/meshes/${body.mesh}` : undefined,
      parts: (body?.parts ?? []).map(
        (p): ScenePart =>
          p.shape === "box"
            ? {
                kind: "box",
                name: p.name,
                position: v3(p.position),
                size: v3(p.size),
                material: p.material,
                color: p.color,
                motions: motionsOf(p.motion),
              }
            : {
                kind: "cylinder",
                name: p.name,
                position: v3(p.position),
                diameter: toMeters(p.diameter),
                length: toMeters(p.length),
                axis: p.axis,
                material: p.material,
                color: p.color,
                motions: motionsOf(p.motion),
              },
      ),
    };
  });
}

/** 모든 박스를 감싸는 바깥 상자 [m]: [최소, 최대]. 박스가 없으면 undefined. */
export function sceneBounds(boxes: readonly SceneBox[]): [Vec3, Vec3] | undefined {
  if (boxes.length === 0) return undefined;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const b of boxes) {
    // 회전은 반지름이 큰 쪽(대각선)으로 보수적으로 감싼다.
    const r = Math.hypot(...b.size) / 2;
    const rotated = b.rotation.some((a) => a % 360 !== 0);
    for (let i = 0; i < 3; i++) {
      const half = rotated ? r : (b.size[i] ?? 0) / 2;
      min[i] = Math.min(min[i] ?? 0, (b.position[i] ?? 0) - half);
      max[i] = Math.max(max[i] ?? 0, (b.position[i] ?? 0) + half);
    }
  }
  return [min, max];
}

/**
 * 시뮬레이션 신호로 부품이 "살아 있는" 정도 (0~1). 색은 이 값으로 강조색을 섞는다 (docs/DESIGN.md: 강조색은 살아 있는 것에만).
 * - LED: 밝기 · 스위치: 닫혀 있으면 1 · 카메라 노드: 절전이 아니면 1(동작 중)
 */
export function activityOf(id: string, signals: Readonly<Record<string, unknown>>): number {
  const brightness = signals[`${id}.brightness`];
  if (typeof brightness === "number") return Math.min(1, Math.max(0, brightness));
  if (signals[`${id}.closed`] === true) return 1;
  const phase = signals[`${id}.phase`];
  if (typeof phase === "string") return phase === "sleep" ? 0 : 1;
  return 0;
}

/** 3D 케이블 하나: 연결(connection)의 두 끝이 모두 핀 위치를 가질 때만 만든다. 좌표는 월드 [m]. */
export interface SceneCable {
  readonly id: string;
  /** 양 끝 부품 Instance ID (분해 보기에서 끝점을 부품과 함께 옮기려고). */
  readonly fromId: string;
  readonly toId: string;
  readonly from: Vec3;
  readonly to: Vec3;
  /** 접지 선이면 검정, 아니면 빨강 계열로 그린다. */
  readonly ground: boolean;
  /** 케이블이 부품 바깥으로 나오는 방향(위 또는 옆)을 잡는 용도: 두 끝의 부품 중심. */
  readonly fromCenter: Vec3;
  readonly toCenter: Vec3;
  /** 두 부품의 월드 반크기 (회전 반영). 케이블이 부품 바깥으로 빠지는 거리를 잡는다. */
  readonly fromHalf: Vec3;
  readonly toHalf: Vec3;
}

const rad = (d: number) => (d * Math.PI) / 180;

/** z → y → x 순서 회전 (core fit과 같은 규약). */
function rotateVec(v: Vec3, rotation: Vec3): Vec3 {
  const [rx, ry, rz] = rotation.map(rad) as [number, number, number];
  let [x, y, z] = v;
  [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
  [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
  [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
  return [x, y, z];
}

/** 회전한 박스의 월드 반크기. */
function worldHalf(box: SceneBox): Vec3 {
  const [hx, hy, hz] = box.size.map((v) => v / 2) as [number, number, number];
  const ax = rotateVec([hx, 0, 0], box.rotation).map(Math.abs);
  const ay = rotateVec([0, hy, 0], box.rotation).map(Math.abs);
  const az = rotateVec([0, 0, hz], box.rotation).map(Math.abs);
  return [0, 1, 2].map((i) => (ax[i] ?? 0) + (ay[i] ?? 0) + (az[i] ?? 0)) as unknown as Vec3;
}

export function buildCables(loaded: LoadedSystem, boxes: readonly SceneBox[]): SceneCable[] {
  const pinOf = (
    ref: string,
  ): { world: Vec3; center: Vec3; half: Vec3; ground: boolean } | undefined => {
    const [instId, portName] = ref.split(":");
    const box = boxes.find((b) => b.id === instId);
    const inst = loaded.system.instances.find((i) => i.id === instId);
    const model = loaded.registry.getModel(inst?.model ?? "");
    const pin = model?.body?.pins?.find((p) => p.port === portName);
    if (!box || !pin) return undefined;
    const local = rotateVec(v3(pin.position), box.rotation);
    const port = model?.ports.find((p) => p.name === portName);
    return {
      world: [box.position[0] + local[0], box.position[1] + local[1], box.position[2] + local[2]],
      center: box.position,
      half: worldHalf(box),
      ground: port?.ground === true,
    };
  };
  return loaded.doc.connections.flatMap(([a, b]) => {
    const pa = pinOf(a);
    const pb = pinOf(b);
    if (!pa || !pb) return [];
    return [
      {
        id: `${a}~${b}`,
        fromId: a.split(":")[0] ?? "",
        toId: b.split(":")[0] ?? "",
        from: pa.world,
        to: pb.world,
        ground: pa.ground || pb.ground,
        fromCenter: pa.center,
        toCenter: pb.center,
        fromHalf: pa.half,
        toHalf: pb.half,
      },
    ];
  });
}

/**
 * 분해 보기에서 부품마다 띄우는 높이 [m]: 아래(z)에 있는 부품부터 차례로 `step`씩 더 올린다.
 * 같은 높이의 부품은 같은 단. `amount`는 0~1.
 */
export function explodeLifts(
  boxes: readonly SceneBox[],
  amount: number,
  step = 0.008,
): Map<string, number> {
  const levels = [...new Set(boxes.map((b) => Math.round(b.position[2] * 1e6)))].sort(
    (a, b) => a - b,
  );
  return new Map(
    boxes.map((b) => [b.id, levels.indexOf(Math.round(b.position[2] * 1e6)) * step * amount]),
  );
}

/** 시뮬레이션 신호로 움직이는 부품의 현재 자세: 월드 위치 [m]와 z축 회전 더하기 [rad]. */
export interface AnimatedPose {
  readonly position: Vec3;
  readonly heading: number;
}

/**
 * 부품의 신호 `<id>.x`, `<id>.y`, `<id>.heading`(차체 같은 구동 부품의 출력)으로 자세를 계산한다.
 * `parents`(assembly의 parent)로 연결된 부품은 부모와 같은 변위·회전을 받는다: 부모 위치를 중심으로 돌고 평행 이동한다.
 * 신호가 없으면 정적 배치 그대로다.
 */
export function animatedPoses(
  boxes: readonly SceneBox[],
  parents: Readonly<Record<string, string | undefined>>,
  signals: Readonly<Record<string, unknown>>,
): Map<string, AnimatedPose> {
  const num = (key: string) =>
    typeof signals[key] === "number" ? (signals[key] as number) : undefined;
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const poseSignals = (id: string) => {
    const x = num(`${id}.x`);
    const y = num(`${id}.y`);
    const h = num(`${id}.heading`);
    return x === undefined && y === undefined && h === undefined
      ? undefined
      : { x: x ?? 0, y: y ?? 0, h: h ?? 0 };
  };
  const out = new Map<string, AnimatedPose>();
  for (const b of boxes) {
    const own = poseSignals(b.id);
    const parentId = parents[b.id];
    const parent = parentId ? byId.get(parentId) : undefined;
    const ps = own ?? (parentId ? poseSignals(parentId) : undefined);
    if (!ps) {
      out.set(b.id, { position: b.position, heading: 0 });
      continue;
    }
    // 부모가 있으면 부모 중심을 축으로 돌린다. 스스로 신호를 가진 부품은 자기 중심이 축이다.
    const pivot = own || !parent ? b.position : parent.position;
    const dx = b.position[0] - pivot[0];
    const dy = b.position[1] - pivot[1];
    const c = Math.cos(ps.h);
    const sn = Math.sin(ps.h);
    out.set(b.id, {
      position: [
        pivot[0] + dx * c - dy * sn + ps.x,
        pivot[1] + dx * sn + dy * c + ps.y,
        b.position[2],
      ],
      heading: ps.h,
    });
  }
  return out;
}

/**
 * 격자 한 칸 크기 [m]: 장면 크기에 맞춰 10 mm부터 1·2·5 배수로 키워, 격자 선이 80칸을 넘지 않게 한다
 * (큰 장면에서 1 cm 격자가 빽빽해 보이는 현상을 막는다).
 */
export function gridCell(extent: number): number {
  const target = Math.max(extent * 3, 0.12);
  for (const cell of [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5]) {
    if (target / cell <= 80) return cell;
  }
  return 10;
}

/**
 * 부품에 붙은 점(핀)이 부품의 움직임(자세)을 따라간 위치: 부품 중심 기준 상대 위치를 헤딩만큼 돌려 새 중심에 더한다.
 * `pose`가 없으면 그대로다.
 */
export function followPose(point: Vec3, center: Vec3, pose: AnimatedPose | undefined): Vec3 {
  if (!pose) return point;
  const dx = point[0] - center[0];
  const dy = point[1] - center[1];
  const c = Math.cos(pose.heading);
  const s = Math.sin(pose.heading);
  return [
    pose.position[0] + dx * c - dy * s,
    pose.position[1] + dx * s + dy * c,
    pose.position[2] + (point[2] - center[2]),
  ];
}
