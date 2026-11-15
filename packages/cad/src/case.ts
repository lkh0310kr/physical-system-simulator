/**
 * 케이스 생성기 (P7-T16): 조립된 부품들을 감싸는 베이스 + 뚜껑을 만든다.
 *
 * 구조 (단면, 벽 바깥 → 안쪽):
 *   베이스 벽 = [뚜껑 치마가 덮는 바깥쪽][틈][혀(tongue) — 뚜껑 안쪽으로 올라감] → 공동(cavity)
 *   뚜껑 = 윗판 + 아래로 내려가는 치마. 혀와 치마가 `lipH`만큼 겹쳐 눌러 끼움(press-fit)으로 닫힌다.
 * 공동은 모든 부품의 외곽 상자 + 부품 여유다. 부품 외곽은 축 정렬 상자(AABB)이므로 여유 공간이 실제보다 클 수 있다.
 * 스냅핏·나사는 아직 없다: 부품은 상자 여유와 마찰·접착으로 잡는다.
 * 단위는 mm. 좌표는 System의 assembly 좌표 그대로다.
 */
import {
  type FitItem,
  fitItemsOf,
  type LoadedSystem,
  placementPosition,
  type Vec3 as SiVec3,
  toMeters,
  worldBox,
} from "@physisim/core";
import {
  box,
  cylinderAlong,
  loadGeometry,
  type Mesh,
  meshOf,
  type Solid,
  type Vec3,
} from "./geometry.ts";
import type { ProcessProfile } from "./process.ts";

const MM = 1000;

/** 혀와 치마가 겹치는 높이. */
export const LIP_HEIGHT = 2;

export interface CasePart {
  readonly id: string;
  readonly model: string;
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface CaseOpening {
  readonly part: string;
  readonly mount: string;
  /** 부품이 통과해야 하는 지점 (월드 mm). */
  readonly position: Vec3;
  /** 뚫는 방향 축 (0=x 1=y 2=z)과 부호. */
  readonly axis: 0 | 1 | 2;
  readonly sign: 1 | -1;
  /** 법선에 수직인 두 축(작은 번호 순)에서의 크기. 원형이면 둘 다 지름. */
  readonly shape: "round" | "rect";
  readonly size: readonly [number, number];
}

export interface CaseInput {
  readonly parts: readonly CasePart[];
  readonly openings: readonly CaseOpening[];
  /** 입력을 읽으며 만난 문제 (축에 안 맞는 법선 등). 있으면 검증이 거부한다. */
  readonly problems: readonly string[];
}

const rad = (d: number) => (d * Math.PI) / 180;

/** z → y → x 순서로 회전 (fit.ts와 같은 규약). */
function rotate(v: SiVec3, rotation: readonly [number, number, number]): SiVec3 {
  const [rx, ry, rz] = rotation.map(rad) as [number, number, number];
  let [x, y, z] = v;
  [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
  [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
  [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
  return [x, y, z];
}

/** 벡터가 가리키는 주 축. 축에서 5° 넘게 벗어나면 undefined. */
function snapAxis(v: SiVec3): { axis: 0 | 1 | 2; sign: 1 | -1 } | undefined {
  const len = Math.hypot(...v);
  if (len === 0) return undefined;
  const k = v.map((c) => Math.abs(c) / len);
  const axis = k.indexOf(Math.max(...k)) as 0 | 1 | 2;
  if ((k[axis] ?? 0) < Math.cos(rad(5))) return undefined;
  return { axis, sign: (v[axis] ?? 0) >= 0 ? 1 : -1 };
}

/** 로드된 System에서 케이스 입력(부품 외곽과 개구부)을 뽑는다. */
export function caseInputOf(loaded: LoadedSystem): CaseInput {
  const items = fitItemsOf(loaded);
  const parts: CasePart[] = [];
  const openings: CaseOpening[] = [];
  const problems: string[] = [];
  const assembly = loaded.doc.assembly ?? {};
  for (const item of items) {
    if (!item.size) continue;
    const inst = loaded.system.instances.find((i) => i.id === item.id);
    const model = loaded.registry.getModel(inst?.model ?? "");
    const b = worldBox({ ...item, size: item.size } as FitItem & { size: SiVec3 });
    parts.push({
      id: item.id,
      model: inst?.model ?? "",
      min: b.min.map((v) => v * MM) as unknown as Vec3,
      max: b.max.map((v) => v * MM) as unknown as Vec3,
    });
    const placed = assembly[item.id];
    const rotation = (placed?.rotation ?? [0, 0, 0]) as [number, number, number];
    const origin = placed ? placementPosition(placed) : ([0, 0, 0] as SiVec3);
    for (const mount of model?.mounts ?? []) {
      if (!mount.opening) continue;
      const label = `${item.id}.${mount.name}`;
      const local = mount.position.map(toMeters) as unknown as SiVec3;
      const normal = rotate((mount.normal ?? [0, 0, 1]) as unknown as SiVec3, rotation);
      const dir = snapAxis(normal);
      if (!dir) {
        problems.push(`${label}: 법선이 축 방향이 아니다 (개구부는 x·y·z 축 방향만 지원)`);
        continue;
      }
      const at = rotate(local, rotation).map((v, i) => (v + (origin[i] ?? 0)) * MM);
      const o = mount.opening;
      // 법선에 수직인 두 로컬 축(u, v)이 회전 뒤 월드의 어느 축에 놓이는지로 가로·세로를 맞춘다.
      const localNormal = snapAxis((mount.normal ?? [0, 0, 1]) as unknown as SiVec3);
      const localPerp = [0, 1, 2].filter((a) => a !== localNormal?.axis) as [number, number];
      const worldPerp = localPerp.map((a) => {
        const e: [number, number, number] = [0, 0, 0];
        e[a] = 1;
        return snapAxis(rotate(e, rotation))?.axis ?? -1;
      });
      let size: [number, number];
      if (o.shape === "round") {
        const d = toMeters(o.diameter) * MM;
        size = [d, d];
      } else {
        const w = toMeters(o.width) * MM;
        const h = toMeters(o.height) * MM;
        // 월드에서 작은 축 번호가 앞이므로, u(가로)가 더 큰 축으로 갔으면 서로 바꾼다
        size = (worldPerp[0] ?? 0) <= (worldPerp[1] ?? 0) ? [w, h] : [h, w];
      }
      openings.push({
        part: item.id,
        mount: mount.name,
        position: at as unknown as Vec3,
        axis: dir.axis,
        sign: dir.sign,
        shape: o.shape,
        size,
      });
    }
  }
  return { parts, openings, problems };
}

export interface CaseGeometry {
  /** 공동(부품이 들어가는 빈 공간) 범위. */
  readonly cavity: { readonly min: Vec3; readonly max: Vec3 };
  /** 케이스 바깥 범위. */
  readonly outer: { readonly min: Vec3; readonly max: Vec3 };
  /** 조립 좌표 그대로의 베이스·뚜껑. */
  readonly base: Solid;
  readonly lid: Solid;
  /** 개구부를 뚫기 전 베이스·뚜껑 (개구부가 벽을 실제로 만나는지 검증용). */
  readonly uncut: { readonly base: Solid; readonly lid: Solid };
  /** 개구부별 뚫은 통로(검증용). */
  readonly cutters: readonly { readonly opening: CaseOpening; readonly solid: Solid }[];
}

/** 케이스 안쪽 혀의 두께: 가장 얇은 벽. */
export const tongueOf = (p: ProcessProfile) => p.minWall;
/** 뚜껑 치마 두께: 벽 − 혀 − 틈. */
export const skirtOf = (p: ProcessProfile) => p.wall - p.minWall - p.fitGap;

export async function generateCase(
  input: CaseInput,
  profile: ProcessProfile,
): Promise<CaseGeometry> {
  if (input.parts.length === 0)
    throw new Error("케이스를 만들 부품이 없다 (body가 있는 부품 필요)");
  const m = await loadGeometry();
  const lo = [0, 1, 2].map((i) => Math.min(...input.parts.map((p) => p.min[i] ?? 0)));
  const hi = [0, 1, 2].map((i) => Math.max(...input.parts.map((p) => p.max[i] ?? 0)));
  const c = profile.partClearance;
  const W = profile.wall;
  const T = profile.plate;
  const tongue = tongueOf(profile);
  const [cx0, cy0, cz0] = lo.map((v) => v - c) as [number, number, number];
  const [cx1, cy1, cz1] = hi.map((v) => v + c) as [number, number, number];
  const cavity = { min: [cx0, cy0, cz0] as const, max: [cx1, cy1, cz1] as const };
  const outer = {
    min: [cx0 - W, cy0 - W, cz0 - T] as const,
    max: [cx1 + W, cy1 + W, cz1 + T] as const,
  };
  const grow = (d: number, z0: number, z1: number) =>
    box(m, [cx0 - d, cy0 - d, z0], [cx1 + d, cy1 + d, z1]);
  const cavityBox = box(m, cavity.min, [cx1, cy1, cz1 + 1]);

  // 맞닿는 면이 부동소수 오차로 떨어지지 않게 합칠 때 0.5 mm씩 겹친다
  // 베이스: 바깥 벽은 뚜껑 치마 아래까지, 혀는 공동 높이까지
  const zJoin = cz1 - LIP_HEIGHT;
  let base = grow(W, outer.min[2], zJoin)
    .add(grow(tongue, zJoin - 0.5, cz1))
    .subtract(cavityBox);
  // 뚜껑: 윗판 + 치마(혀와 틈을 두고 바깥을 감싼다)
  let lid = grow(W, cz1, outer.max[2]).add(
    grow(W, zJoin, cz1).subtract(grow(tongue + profile.fitGap, zJoin - 1, cz1 + 1)),
  );

  const uncut = { base, lid };
  const cutters: { opening: CaseOpening; solid: Solid }[] = [];
  const oc = profile.openingClearance;
  for (const o of input.openings) {
    const a = o.axis;
    const others = [0, 1, 2].filter((k) => k !== a) as [number, number];
    const outerFace = o.sign > 0 ? outer.max[a] : outer.min[a];
    const start = o.position[a] ?? 0;
    const end = outerFace + o.sign * 1;
    const [from, to] = start < end ? [start, end] : [end, start];
    const cu = o.position[others[0]] ?? 0;
    const cv = o.position[others[1]] ?? 0;
    let solid: Solid;
    if (o.shape === "round") {
      solid = cylinderAlong(m, a, from, to, [cu, cv], o.size[0] + 2 * oc);
    } else {
      const lo3: [number, number, number] = [0, 0, 0];
      const hi3: [number, number, number] = [0, 0, 0];
      lo3[a] = from;
      hi3[a] = to;
      lo3[others[0]] = cu - o.size[0] / 2 - oc;
      hi3[others[0]] = cu + o.size[0] / 2 + oc;
      lo3[others[1]] = cv - o.size[1] / 2 - oc;
      hi3[others[1]] = cv + o.size[1] / 2 + oc;
      solid = box(m, lo3, hi3);
    }
    base = base.subtract(solid);
    lid = lid.subtract(solid);
    cutters.push({ opening: o, solid });
  }
  return { cavity, outer, base, lid, uncut, cutters };
}

export interface PrintLayout {
  readonly base: Mesh;
  /** 윗판이 베드에 닿도록 뒤집은 뚜껑. */
  readonly lid: Mesh;
}

/** 출력 자세: 둘 다 z=0 위에 놓고, 뚜껑은 뒤집어 베이스 옆에 둔다. */
export function printLayout(g: CaseGeometry): PrintLayout {
  const base = g.base.translate([-g.outer.min[0], -g.outer.min[1], -g.outer.min[2]]);
  const width = g.outer.max[0] - g.outer.min[0];
  const lid = g.lid
    .rotate([180, 0, 0])
    .translate([-g.outer.min[0] + width + 10, g.outer.max[1], g.outer.max[2]]);
  return { base: meshOf(base), lid: meshOf(lid) };
}
