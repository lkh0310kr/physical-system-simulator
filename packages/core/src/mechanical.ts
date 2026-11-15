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

/** 표면 재질 분류. 렌더러가 분류별 PBR 값을 고른다 (형상 데이터에 셰이더를 넣지 않는다). */
export const MaterialKindSchema = z.enum(["pcb", "metal", "plastic", "glass", "rubber"]);

/** 세부 형상이 시뮬레이션 신호를 따라 평행 이동하는 방식 (플런저가 눌리는 모습 등). 표시 전용. */
export const TranslateMotionSchema = z.strictObject({
  /** 이 부품 Instance의 출력 신호 이름 (0~1). 예: "plunger" */
  signal: z.string().min(1),
  axis: z.enum(["x", "y", "z"]),
  /** 신호가 1일 때 이동하는 거리. 음수면 반대 방향. 실제 이동이 작으면 눈에 보이게 과장해도 되고, 과장은 Model 설명에 적는다. */
  distance: LengthSchema,
});

/** 신호(라디안)를 따라 자기 중심을 축으로 도는 방식 (바퀴·팬). */
export const RotateMotionSchema = z.strictObject({
  signal: z.string().min(1),
  axis: z.enum(["x", "y", "z"]),
  rotate: z.literal(true),
  /** 신호 1당 회전 각도 [rad]. 기본 1 (신호가 rad이면 그대로). */
  scale: z.number().default(1),
  /** 회전 중심 (body 중심 기준 mm). 생략하면 이 형상의 중심. 여러 형상이 한 바퀴처럼 같이 돌게 할 때 쓴다. */
  pivot: Vec3Schema.optional(),
});

export const MotionSchema = z.union([RotateMotionSchema, TranslateMotionSchema]);

/**
 * 부품 안의 세부 형상 (보드, 커넥터, 렌즈 통 등). 표시 전용이며 케이스·간섭 계산은 `body` 박스를 쓴다.
 * 위치는 body 중심 기준 mm, `axis`는 원기둥의 축(기본 z).
 */
export const PartShapeSchema = z.discriminatedUnion("shape", [
  z.strictObject({
    name: z.string().min(1),
    shape: z.literal("box"),
    position: Vec3Schema,
    size: Vec3Schema,
    material: MaterialKindSchema.default("plastic"),
    color: z.string().optional(),
    motion: MotionSchema.optional(),
  }),
  z.strictObject({
    name: z.string().min(1),
    shape: z.literal("cylinder"),
    position: Vec3Schema,
    diameter: LengthSchema,
    length: LengthSchema,
    axis: z.enum(["x", "y", "z"]).default("z"),
    material: MaterialKindSchema.default("plastic"),
    color: z.string().optional(),
    motion: MotionSchema.optional(),
  }),
]);

/** 전기 Port가 물리적으로 닿는 지점 (납땜 패드·커넥터 핀). 배선(connections)을 3D 케이블로 그릴 때 끝점이 된다. body 중심 기준 mm. */
export const PinLocationSchema = z.strictObject({
  port: z.string().min(1),
  position: Vec3Schema,
  /** 보드에 적힌 이름 (예: "BAT+"). Port 이름과 다를 때 쓴다. */
  label: z.string().optional(),
});

/** 기구 형상: 박스(필수 크기) + 선택적 외부 메시. 메시가 없으면 박스로 그린다. */
export const BodySchema = z.strictObject({
  /** 가로(x)·세로(y)·높이(z) 크기. */
  size: Vec3Schema,
  /** 질량 [g]. 물리 엔진(7b)과 무게 비교에 쓴다. */
  mass: z.number().min(0).optional(),
  /** 제작사 CAD에서 변환한 형상(glb). PhysiSim body 좌표계(m, z 위, 중심 원점). 웹은 `/meshes/<이름>`에서 읽는다. 없으면 `parts`, 그것도 없으면 박스. */
  mesh: z.string().min(1).optional(),
  /** 표시 색 (CSS 색). 없으면 분류별 기본색. */
  color: z.string().optional(),
  /** Port가 닿는 위치. 있으면 연결을 3D 케이블로 보여 준다. */
  pins: z.array(PinLocationSchema).optional(),
  /** 표시용 세부 형상. 있으면 박스 대신 이것들을 그린다 (박스는 계산에만 쓴다). */
  parts: z.array(PartShapeSchema).optional(),
});

/**
 * 케이스 벽에 뚫어야 하는 개구부 (렌즈, 커넥터, 버튼 접근 구멍).
 * `round`는 지름, `rect`는 법선에 수직인 두 축의 크기: 법선이 ±x면 (y, z), ±y면 (x, z), ±z면 (x, y).
 * 크기는 통과해야 하는 **부품 쪽 치수**이고, 틈새는 공정 프로필이 더한다.
 */
export const OpeningSchema = z.discriminatedUnion("shape", [
  z.strictObject({ shape: z.literal("round"), diameter: LengthSchema }),
  z.strictObject({ shape: z.literal("rect"), width: LengthSchema, height: LengthSchema }),
]);

/** 다른 부품과 맞물리는 장착점 (카메라 렌즈 위치, 배터리 고정 위치 등). body 중심 기준 좌표. */
export const MountSchema = z.strictObject({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/, { message: "소문자 kebab-case 이름" }),
  position: Vec3Schema,
  /** 장착점이 향하는 방향 (단위 벡터). 생략하면 +z. */
  normal: z.tuple([z.number(), z.number(), z.number()]).optional(),
  description: z.string().optional(),
  /** 있으면 케이스가 이 점에서 법선 방향으로 벽을 뚫는다. 법선은 축 방향이어야 한다. */
  opening: OpeningSchema.optional(),
});

export const PlacementSchema = z.strictObject({
  /** 조립 좌표계(원점은 문서가 정한다) 기준 body 중심 위치. */
  position: Vec3Schema,
  /** x·y·z 축 회전 [도] (z → y → x 순서로 적용). 생략하면 0. */
  rotation: z.tuple([z.number(), z.number(), z.number()]).optional(),
  /** 이 부품이 따라 움직이는 부품(Instance ID). 3D에서 부모의 위치·방향 신호(x, y, heading)를 같이 받는다. 예: 차체 위의 모터·배터리. */
  parent: z.string().optional(),
});

export type Body = z.output<typeof BodySchema>;
export type Motion = z.output<typeof MotionSchema>;
export type PinLocation = z.output<typeof PinLocationSchema>;
export type PartShape = z.output<typeof PartShapeSchema>;
export type MaterialKind = z.output<typeof MaterialKindSchema>;
export type Opening = z.output<typeof OpeningSchema>;
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
