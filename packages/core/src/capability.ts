/**
 * Capability: Model이 제공하는 기능의 독립 정의 (스펙 §5).
 * 실행 로직은 갖지 않고, 기본 Behavior를 참조만 한다 (스펙 §14, ADR-0001).
 */
import { z } from "zod";
import { BehaviorId, CapabilityId } from "./ids.ts";
import { PropertySchemaSchema } from "./property.ts";

export const CapabilitySchema = z.strictObject({
  id: CapabilityId,
  name: z.string().min(1),
  description: z.string().optional(),
  /** Behavior가 받는 신호. */
  inputs: PropertySchemaSchema.default({}),
  /** Behavior가 내보내는 신호. */
  outputs: PropertySchemaSchema.default({}),
  /** Model별로 다른 설정(핀 수, 논리 전압 등). Model 바인딩의 `config`로 값을 준다. */
  parameters: PropertySchemaSchema.default({}),
  /** Model 바인딩이 override하지 않을 때 쓰는 Behavior. */
  defaultBehavior: BehaviorId.optional(),
});

/** 검증·기본값 적용이 끝난 Capability. */
export type Capability = z.output<typeof CapabilitySchema>;
/** JSON으로 작성하는 Capability (생략 가능한 필드 포함). */
export type CapabilityInput = z.input<typeof CapabilitySchema>;
