/**
 * 기구 도메인 (스펙 §4, v0.13): Model의 `body`(형상)와 `mounts`(장착점), System의 `assembly`(3D 배치).
 * 길이는 숫자(mm) 또는 `"25.5mm"`, `"2cm"` 같은 물리량 문자열로 쓰고, 내부에서는 SI(m)로 다룬다.
 */
import { z } from "zod";
import { parseQuantity, parseUnit, sameDimension } from "./units.ts";

const LENGTH = parseUnit("m");

/** 숫자는 mm, 문자열은 길이 단위가 붙은 물리량. */
export const LengthSchema = z.union([z.number(), z.string()]).refine(
  (v) => {
    if (typeof v === "number") return Number.isFinite(v);
    try {
      const q = parseQuantity(v);
      return sameDimension(q.unit, LENGTH);
    } catch {
      return false;
    }
  },
  { message: '길이여야 한다 (숫자는 mm, 또는 "25.5mm", "2cm")' },
);

/** 길이 값을 SI(m)로. 형식은 `LengthSchema`가 보장한다. */
export function toMeters(v: number | string): number {
  return typeof v === "number" ? v / 1000 : parseQuantity(v).value;
}

export const Vec3Schema = z.tuple([LengthSchema, LengthSchema, LengthSchema]);
export type Vec3 = readonly [number, number, number];

/** 기구 형상: 박스(필수 크기) + 선택적 외부 메시. 메시가 없으면 박스로 그린다. */
export const BodySchema = z.strictObject({
  /** 가로(x)·세로(y)·높이(z) 크기. */
  size: Vec3Schema,
  /** 질량 [g]. 물리 엔진(7b)과 무게 비교에 쓴다. */
  mass: z.number().min(0).optional(),
  /** CAD에서 내보낸 형상 파일 (이 Model 파일 기준 상대 경로, glTF/STL). 없으면 박스. */
  mesh: z.string().min(1).optional(),
  /** 표시 색 (CSS 색). 없으면 분류별 기본색. */
  color: z.string().optional(),
});

/** 다른 부품과 맞물리는 장착점 (카메라 렌즈 위치, 배터리 고정 위치 등). body 중심 기준 좌표. */
export const MountSchema = z.strictObject({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/, { message: "소문자 kebab-case 이름" }),
  position: Vec3Schema,
  /** 장착점이 향하는 방향 (단위 벡터). 생략하면 +z. */
  normal: z.tuple([z.number(), z.number(), z.number()]).optional(),
  description: z.string().optional(),
});

export const PlacementSchema = z.strictObject({
  /** 조립 좌표계(원점은 문서가 정한다) 기준 body 중심 위치. */
  position: Vec3Schema,
  /** x·y·z 축 회전 [도] (z → y → x 순서로 적용). 생략하면 0. */
  rotation: z.tuple([z.number(), z.number(), z.number()]).optional(),
});

export type Body = z.output<typeof BodySchema>;
export type Mount = z.output<typeof MountSchema>;
export type Placement3D = z.output<typeof PlacementSchema>;

/** SI(m)로 환산한 박스 크기. */
export function bodySize(body: Body): Vec3 {
  const [x, y, z] = body.size;
  return [toMeters(x), toMeters(y), toMeters(z)];
}

/** SI(m)로 환산한 위치. */
export function placementPosition(p: Placement3D): Vec3 {
  const [x, y, z] = p.position;
  return [toMeters(x), toMeters(y), toMeters(z)];
}
