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
export type ScenePart =
  | {
      readonly kind: "box";
      readonly name: string;
      readonly position: Vec3;
      readonly size: Vec3;
      readonly material: MaterialKind;
      readonly color: string | undefined;
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
