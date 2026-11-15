/**
 * 크기·간섭 검사 (P7-T4): 조립된 부품의 축 정렬 상자(AABB)로 겹침, 외곽 크기, 부피, 점유 면적을 계산한다.
 * 회전은 AABB로 보수적으로 감싼다 (회전한 상자는 실제보다 크게 잡힐 수 있다). 단위는 SI(m).
 */
import { bodySize, placementPosition, type Vec3 } from "./mechanical.ts";
import type { LoadedSystem } from "./project.ts";

export interface FitBox {
  readonly id: string;
  readonly min: Vec3;
  readonly max: Vec3;
  /** 회전 전 박스의 바닥 면적 (x·y) [m²]. */
  readonly footprint: number;
}

export interface FitOverlap {
  readonly a: string;
  readonly b: string;
  /** 겹친 부피 [m³]. */
  readonly volume: number;
}

export interface FitReport {
  readonly boxes: readonly FitBox[];
  readonly overlaps: readonly FitOverlap[];
  /** 외곽 상자 크기 x·y·z [m]. 부품이 없으면 [0,0,0]. */
  readonly size: Vec3;
  /** 외곽 상자 부피 [m³]. */
  readonly volume: number;
  /** 치수가 있는 부품의 바닥 면적 합 [m²] (포장·PCB·케이스 제외, 하한). */
  readonly footprintArea: number;
  /** body가 없어 계산에서 빠진 부품 ID. */
  readonly missing: readonly string[];
}

export interface FitItem {
  readonly id: string;
  /** 치수가 없으면 undefined (계산에서 제외하고 missing에 올린다). */
  readonly size: Vec3 | undefined;
  readonly position: Vec3;
  /** x·y·z 축 회전 [도], z → y → x 순서. */
  readonly rotation: Vec3;
}

const rad = (d: number) => (d * Math.PI) / 180;

/** 회전한 상자의 세계 좌표 반폭: |R|·(size/2). */
function worldHalf(size: Vec3, rotation: Vec3): Vec3 {
  const [rx, ry, rz] = rotation.map(rad) as [number, number, number];
  const [cx, sx, cy, sy, cz, sz] = [
    Math.cos(rx),
    Math.sin(rx),
    Math.cos(ry),
    Math.sin(ry),
    Math.cos(rz),
    Math.sin(rz),
  ];
  // R = Rx · Ry · Rz
  const r = [
    [cy * cz, -cy * sz, sy],
    [sx * sy * cz + cx * sz, -sx * sy * sz + cx * cz, -sx * cy],
    [-cx * sy * cz + sx * sz, cx * sy * sz + sx * cz, cx * cy],
  ];
  const half = size.map((v) => v / 2);
  return [0, 1, 2].map((i) =>
    (r[i] ?? []).reduce((s, v, j) => s + Math.abs(v) * (half[j] ?? 0), 0),
  ) as unknown as Vec3;
}

export function worldBox(item: FitItem & { size: Vec3 }): FitBox {
  const h = worldHalf(item.size, item.rotation);
  const min = item.position.map((p, i) => p - (h[i] ?? 0)) as unknown as Vec3;
  const max = item.position.map((p, i) => p + (h[i] ?? 0)) as unknown as Vec3;
  return { id: item.id, min, max, footprint: item.size[0] * item.size[1] };
}

/** 두 상자의 겹친 부피. 닿기만 하면 0. */
export function overlapVolume(a: FitBox, b: FitBox): number {
  let v = 1;
  for (let i = 0; i < 3; i++) {
    const d = Math.min(a.max[i] ?? 0, b.max[i] ?? 0) - Math.max(a.min[i] ?? 0, b.min[i] ?? 0);
    if (d <= 1e-12) return 0;
    v *= d;
  }
  return v;
}

export function analyzeFit(items: readonly FitItem[]): FitReport {
  const boxes = items.flatMap((i) => (i.size ? [worldBox({ ...i, size: i.size })] : []));
  const missing = items.filter((i) => !i.size).map((i) => i.id);
  const overlaps: FitOverlap[] = [];
  for (const [i, a] of boxes.entries()) {
    for (const b of boxes.slice(i + 1)) {
      const volume = overlapVolume(a, b);
      if (volume > 0) overlaps.push({ a: a.id, b: b.id, volume });
    }
  }
  const lo = [0, 1, 2].map((i) => Math.min(...boxes.map((b) => b.min[i] ?? 0)));
  const hi = [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b.max[i] ?? 0)));
  const size = (boxes.length
    ? [0, 1, 2].map((i) => (hi[i] ?? 0) - (lo[i] ?? 0))
    : [0, 0, 0]) as unknown as Vec3;
  return {
    boxes,
    overlaps,
    size,
    volume: size[0] * size[1] * size[2],
    footprintArea: boxes.reduce((s, b) => s + b.footprint, 0),
    missing,
  };
}

/** 로드된 System의 조립(assembly)과 Model body로 검사 항목을 만든다. 배치가 없는 부품은 원점에 둔다. */
export function fitItemsOf(loaded: LoadedSystem): FitItem[] {
  const assembly = loaded.doc.assembly ?? {};
  return loaded.system.instances.map((inst) => {
    const body = loaded.registry.getModel(inst.model)?.body;
    const placed = assembly[inst.id];
    const position: Vec3 = placed ? placementPosition(placed) : [0, 0, 0];
    return {
      id: inst.id,
      size: body ? bodySize(body) : undefined,
      position,
      rotation: (placed?.rotation ?? [0, 0, 0]) as Vec3,
    };
  });
}

export const analyzeLoadedFit = (loaded: LoadedSystem): FitReport => analyzeFit(fitItemsOf(loaded));
