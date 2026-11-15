/**
 * Model: 물리적 대상을 표현하는 재사용 가능한 정의 데이터 (스펙 §4).
 * Identity · Properties · Components · Capabilities · Metadata.
 */
import { z } from "zod";
import type { Capability } from "./capability.ts";
import { BehaviorId, CapabilityId, ModelId } from "./ids.ts";
import { PropertySchemaSchema, PropertyValueSchema } from "./property.ts";

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
  config: z.record(z.string(), PropertyValueSchema).default({}),
  /** Capability의 기본 Behavior 대신 쓸 Behavior. */
  behavior: BehaviorId.optional(),
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
    id: ModelId,
    name: z.string().min(1),
    /** `/`로 나눈 분류 (예: "electronics/output"). */
    category: z.string().min(1),
    description: z.string().optional(),
    propertySchema: PropertySchemaSchema.default({}),
    properties: z.record(z.string(), PropertyValueSchema).default({}),
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
    dup(m.components, (c) => c.name, "components");
    dup(m.capabilities, (c) => c.capability, "capabilities");
  });

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
