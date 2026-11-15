/**
 * Model·Capability의 JSON Schema. Agent tool 입력 스키마, 에디터 자동완성 등에 쓴다.
 * 작성(input) 기준이므로 기본값이 있는 필드는 선택 항목이다.
 * 단위 유효성·중복 검사 같은 코드 검증은 JSON Schema로 표현되지 않으므로 로더 검증을 함께 거쳐야 한다.
 */
import { z } from "zod";
import { CapabilitySchema } from "./capability.ts";
import { ModelSchema } from "./model.ts";
import { SystemSchema } from "./system.ts";

export const modelJsonSchema = () => z.toJSONSchema(ModelSchema, { io: "input" });
export const capabilityJsonSchema = () => z.toJSONSchema(CapabilitySchema, { io: "input" });
export const systemJsonSchema = () => z.toJSONSchema(SystemSchema, { io: "input" });

/** 파일 이름 → JSON Schema. `schemas/` 폴더 생성에 쓴다. */
export const jsonSchemaFiles = () => ({
  "system.schema.json": systemJsonSchema(),
  "model.schema.json": modelJsonSchema(),
  "capability.schema.json": capabilityJsonSchema(),
});
