/**
 * Model: 물리적 대상을 표현하는 재사용 가능한 정의 데이터 (스펙 §4).
 * Identity · Properties · Ports · Components · Capabilities · Metadata.
 */
import { z } from "zod";
import type { Capability } from "./capability.ts";
import { BehaviorId, CapabilityId, ModelId } from "./ids.ts";
import { BodySchema, MountSchema } from "./mechanical.ts";
import { PropertySchemaSchema, PropertyValueSchema } from "./property.ts";

/** Port가 속한 물리 도메인. electrical Port는 전압(across)·전류(through)로 해석된다. */
/** electrical = 전기 단자, mechanical = 회전축, signal = 제어 신호(출력 → 입력, 블록 선). */
export const PortDomainSchema = z.enum(["electrical", "mechanical", "signal"]);
export type PortDomain = z.infer<typeof PortDomainSchema>;

/** 외부와 연결되는 접점 (핀, 단자, 축 등). */
export const PortSchema = z.strictObject({
  /** Model 안에서 유일한 이름 (예: "D13", "GND.1", "A"). */
  name: z.string().regex(/^[A-Za-z0-9_.+-]+$/, { message: "영문·숫자·_.+- 만 쓸 수 있다" }),
  domain: PortDomainSchema,
  /** 회로의 기준 전위(0V)에 묶인 Port (보드 GND 등). */
  ground: z.boolean().optional().describe("true면 회로 기준 전위(0V)에 묶인다 (GND 핀)."),
  /** 신호 Port의 방향. 출력 Port의 이름이 Behavior 출력 이름이고, 입력 Port의 이름이 `inputs` 키다. */
  direction: z.enum(["in", "out"]).optional(),
  description: z.string().optional(),
});

/** 내부 구성 요소: 다른 Model을 이름 붙여 참조한다. */
export const ComponentSchema = z.strictObject({
  /** Model 안에서의 이름 (예: "mcu"). */
  name: z.string().regex(/^[a-z][a-z0-9-]*$/, { message: "소문자 kebab-case 이름" }),
  model: ModelId,
});

/** Model이 Capability를 제공한다는 선언과 Model별 설정. */
export const CapabilityBindingSchema = z.strictObject({
  capability: CapabilityId,
  /** Capability `parameters`에 대한 값. */
  config: z
    .record(z.string(), PropertyValueSchema)
    .default({})
    .describe("Capability parameters에 대한 이 Model의 값."),
  /** Capability의 기본 Behavior 대신 쓸 Behavior. */
  behavior: BehaviorId.optional().describe("Capability의 defaultBehavior 대신 쓸 Behavior ID."),
});

export const MetadataSchema = z.looseObject({
  manufacturer: z.string().optional(),
  version: z.string().optional(),
  /** 데이터 출처 (데이터시트 URL 등). */
  source: z.string().optional(),
  /** 시뮬레이션 충실도: 이상화 / 근사 / 실측 기반. */
  fidelity: z.enum(["ideal", "approximate", "measured"]).optional(),
});

export const ModelSchema = z
  .strictObject({
    /** 에디터·에이전트용 JSON Schema 경로. 검증에는 쓰지 않는다. */
    $schema: z.string().optional(),
    id: ModelId,
    name: z.string().min(1),
    /** `/`로 나눈 분류 (예: "electronics/output"). */
    category: z.string().min(1),
    description: z.string().optional(),
    propertySchema: PropertySchemaSchema.default({}),
    properties: z.record(z.string(), PropertyValueSchema).default({}),
    /** 기구 형상 (3D 조립, 크기·간섭 검사). 없으면 3D에서는 자동 박스를 쓴다. */
    body: BodySchema.optional(),
    mounts: z.array(MountSchema).default([]),
    ports: z.array(PortSchema).default([]),
    components: z.array(ComponentSchema).default([]),
    capabilities: z.array(CapabilityBindingSchema).default([]),
    metadata: MetadataSchema.default({}),
  })
  .superRefine((m, ctx) => {
    const dup = <T>(items: readonly T[], key: (t: T) => string, field: string) => {
      const seen = new Set<string>();
      items.forEach((item, i) => {
        const k = key(item);
        if (seen.has(k)) ctx.addIssue({ code: "custom", path: [field, i], message: `중복: ${k}` });
        seen.add(k);
      });
    };
    dup(m.ports, (p) => p.name, "ports");
    m.ports.forEach((p, i) => {
      if (p.domain === "signal" && !p.direction)
        ctx.addIssue({
          code: "custom",
          path: ["ports", i, "direction"],
          message: '신호 Port는 direction("in"/"out")이 필요하다',
        });
      if (p.domain !== "signal" && p.direction)
        ctx.addIssue({
          code: "custom",
          path: ["ports", i, "direction"],
          message: "direction은 신호 Port에만 쓴다",
        });
    });
    dup(m.mounts, (x) => x.name, "mounts");
    dup(m.components, (c) => c.name, "components");
    dup(m.capabilities, (c) => c.capability, "capabilities");
  });

export type Port = z.output<typeof PortSchema>;
export type Component = z.output<typeof ComponentSchema>;
export type CapabilityBinding = z.output<typeof CapabilityBindingSchema>;
export type Model = z.output<typeof ModelSchema>;
/** JSON으로 작성하는 Model (생략 가능한 필드 포함). */
export type ModelInput = z.input<typeof ModelSchema>;

/**
 * 바인딩에 적용될 Behavior ID (스펙 §14.2).
 * 바인딩의 override → Capability 기본값 순서. 둘 다 없으면 `undefined`.
 */
export function resolveBehaviorId(
  binding: CapabilityBinding,
  capability: Capability,
): string | undefined {
  return binding.behavior ?? capability.defaultBehavior;
}
