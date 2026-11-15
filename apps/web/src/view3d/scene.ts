/**
 * 3D 장면 데이터 (순수 함수): 로드된 System → 렌더할 박스 목록.
 * body가 있으면 실치수 박스, 없으면 "자동 박스"(자리표시, 치수는 가정)로 표시한다 — 가정을 실물처럼 보이게 하지 않는다.
 */
import { bodySize, type LoadedSystem, placementPosition, type Vec3 } from "@physisim/core";

/** body가 없는 부품의 자리표시 크기 [m]. 실제 치수가 아니다. */
export const PLACEHOLDER_SIZE: Vec3 = [0.01, 0.01, 0.004];
/** 자동 배치 간격 [m]. */
const GAP = 0.005;

export interface SceneBox {
  readonly id: string;
  readonly model: string;
  /** 중심 위치 [m]. */
  readonly position: Vec3;
  /** x·y·z 회전 [도]. */
  readonly rotation: Vec3;
  /** 크기 [m]. */
  readonly size: Vec3;
  /** 실치수(body 선언)인지, 자리표시인지. */
  readonly real: boolean;
  readonly color: string | undefined;
}

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
    return {
      id: inst.id,
      model: inst.model,
      position,
      rotation,
      size,
      real: !!body,
      color: body?.color,
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
