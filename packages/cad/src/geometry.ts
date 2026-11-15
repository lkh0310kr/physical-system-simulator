/**
 * 형상 연산 (P7-T14): manifold-3d(Apache-2.0, WASM)로 입체의 합·차를 계산하고 삼각형 메시로 꺼낸다.
 * 길이 단위는 mm — 제작 도구(슬라이서·CAD)가 쓰는 단위다. 코어(SI m)와의 변환은 호출하는 쪽이 한다.
 */
import Module from "manifold-3d";

type Wasm = Awaited<ReturnType<typeof Module>>;
export type Solid = InstanceType<Wasm["Manifold"]>;
export type Vec3 = readonly [number, number, number];

let wasm: Promise<Wasm> | undefined;

/** WASM을 한 번만 불러온다. 결정론: 같은 입력이면 같은 메시. */
export function loadGeometry(): Promise<Wasm> {
  wasm ??= Module().then((m) => {
    m.setup();
    return m;
  });
  return wasm;
}

/** 삼각형 메시. 꼭짓점은 xyz 연속, 삼각형은 바깥에서 볼 때 반시계 방향. */
export interface Mesh {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
}

export function meshOf(solid: Solid): Mesh {
  const m = solid.getMesh();
  const n = m.numProp;
  const positions = new Float32Array((m.vertProperties.length / n) * 3);
  for (let i = 0; i < positions.length / 3; i++) {
    for (let k = 0; k < 3; k++) positions[i * 3 + k] = m.vertProperties[i * n + k] ?? 0;
  }
  return { positions, indices: Uint32Array.from(m.triVerts) };
}

/** 축 정렬 상자 (min~max, mm). */
export function box(m: Wasm, min: Vec3, max: Vec3): Solid {
  const size: [number, number, number] = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  return m.Manifold.cube(size, false).translate([min[0], min[1], min[2]]);
}

/** 축을 따라 놓은 원기둥. `axis`는 0=x 1=y 2=z, `from`~`to`는 그 축 위 구간. */
export function cylinderAlong(
  m: Wasm,
  axis: 0 | 1 | 2,
  from: number,
  to: number,
  center: readonly [number, number],
  diameter: number,
): Solid {
  const base = m.Manifold.cylinder(to - from, diameter / 2, diameter / 2, 48, false);
  // 기본은 +z 축. 축 이동은 회전으로 맞춘다.
  const [u, v] = center;
  if (axis === 2) return base.translate([u, v, from]);
  if (axis === 0) return base.rotate([0, 90, 0]).translate([from, u, v]);
  return base.rotate([-90, 0, 0]).translate([u, from, v]);
}

export interface SolidReport {
  /** manifold가 닫힌 입체로 인정했는지 (구멍·뒤집힌 면 없음). */
  readonly closed: boolean;
  readonly status: string;
  /** 부피 [mm³]. */
  readonly volume: number;
  /** 서로 떨어진 덩어리 수 (한 부품이면 1). */
  readonly components: number;
  readonly min: Vec3;
  readonly max: Vec3;
}

export function inspect(solid: Solid): SolidReport {
  const status = String(solid.status());
  const b = solid.boundingBox();
  return {
    closed: status === "NoError" && !solid.isEmpty(),
    status,
    volume: solid.volume(),
    components: solid.isEmpty() ? 0 : solid.decompose().length,
    min: [b.min[0], b.min[1], b.min[2]],
    max: [b.max[0], b.max[1], b.max[2]],
  };
}
