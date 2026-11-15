/**
 * Property Schema(정의)와 Property 값의 분리 (스펙 §4.3).
 * 같은 정의 형식을 Model 속성, Capability 파라미터·입출력에 공통으로 쓴다.
 */
import { z } from "zod";
import { fail, type Issue, joinPath, ok, type Result } from "./issues.ts";
import { parseQuantity, parseUnit, sameDimension, toSI } from "./units.ts";

const UnitString = z.string().refine(
  (u) => {
    try {
      parseUnit(u);
      return true;
    } catch {
      return false;
    }
  },
  { message: "알 수 없는 단위" },
);

const description = z.string().optional();

/** 숫자 값은 정의된 단위 기준의 숫자 또는 `"3.3V"` 같은 물리량 문자열. */
const NumericValue = z.union([z.number(), z.string()]);

export const PropertyDefinitionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("number"),
    unit: UnitString.optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    default: NumericValue.optional(),
    description,
  }),
  z.strictObject({
    type: z.literal("integer"),
    min: z.number().int().optional(),
    max: z.number().int().optional(),
    default: z.number().int().optional(),
    description,
  }),
  z.strictObject({ type: z.literal("boolean"), default: z.boolean().optional(), description }),
  z.strictObject({ type: z.literal("string"), default: z.string().optional(), description }),
  z.strictObject({
    type: z.literal("enum"),
    options: z.array(z.string()).min(1),
    default: z.string().optional(),
    description,
  }),
]);
export type PropertyDefinition = z.infer<typeof PropertyDefinitionSchema>;

export const PropertySchemaSchema = z.record(z.string(), PropertyDefinitionSchema);
/** 속성 이름 → 정의. */
export type PropertySchema = z.infer<typeof PropertySchemaSchema>;

export const PropertyValueSchema = z.union([z.number(), z.string(), z.boolean()]);
export type PropertyValue = z.infer<typeof PropertyValueSchema>;
export type PropertyValues = Record<string, PropertyValue>;

/** 검증·정규화된 값. 숫자는 SI 단위. */
export type ResolvedValues = Record<string, PropertyValue>;

function resolveNumber(
  def: Extract<PropertyDefinition, { type: "number" }>,
  raw: PropertyValue,
  path: string,
): Result<number> {
  const unit = def.unit ?? "";
  let si: number;
  if (typeof raw === "number") {
    si = toSI(raw, unit);
  } else if (typeof raw === "string") {
    try {
      const q = parseQuantity(raw);
      if (!sameDimension(q.unit, parseUnit(unit))) {
        return fail([
          { path, message: `단위가 맞지 않는다: "${raw}" (기대 단위: ${unit || "무차원"})` },
        ]);
      }
      si = q.value;
    } catch (e) {
      return fail([{ path, message: (e as Error).message }]);
    }
  } else {
    return fail([{ path, message: "숫자 또는 물리량 문자열이어야 한다" }]);
  }
  if (def.min !== undefined && si < toSI(def.min, unit)) {
    return fail([{ path, message: `최솟값 ${def.min}${unit}보다 작다` }]);
  }
  if (def.max !== undefined && si > toSI(def.max, unit)) {
    return fail([{ path, message: `최댓값 ${def.max}${unit}보다 크다` }]);
  }
  return ok(si);
}

function resolveValue(
  def: PropertyDefinition,
  raw: PropertyValue,
  path: string,
): Result<PropertyValue> {
  switch (def.type) {
    case "number":
      return resolveNumber(def, raw, path);
    case "integer":
      if (typeof raw !== "number" || !Number.isInteger(raw)) {
        return fail([{ path, message: "정수여야 한다" }]);
      }
      if (def.min !== undefined && raw < def.min)
        return fail([{ path, message: `최솟값 ${def.min}보다 작다` }]);
      if (def.max !== undefined && raw > def.max)
        return fail([{ path, message: `최댓값 ${def.max}보다 크다` }]);
      return ok(raw);
    case "boolean":
      return typeof raw === "boolean" ? ok(raw) : fail([{ path, message: "boolean이어야 한다" }]);
    case "string":
      return typeof raw === "string" ? ok(raw) : fail([{ path, message: "문자열이어야 한다" }]);
    case "enum":
      return typeof raw === "string" && def.options.includes(raw)
        ? ok(raw)
        : fail([{ path, message: `다음 중 하나여야 한다: ${def.options.join(", ")}` }]);
  }
}

/**
 * 값을 Schema로 검증하고 SI로 정규화한다.
 * 값이 없으면 `default`를 쓰고, default도 없으면 오류. Schema에 없는 값도 오류.
 */
export function resolveProperties(
  schema: PropertySchema,
  values: PropertyValues,
  basePath = "",
): Result<ResolvedValues> {
  const issues: Issue[] = [];
  const resolved: ResolvedValues = {};
  for (const key of Object.keys(values)) {
    if (!(key in schema))
      issues.push({ path: joinPath(basePath, key), message: "정의되지 않은 속성" });
  }
  for (const [key, def] of Object.entries(schema)) {
    const path = joinPath(basePath, key);
    const raw = values[key] ?? def.default;
    if (raw === undefined) {
      issues.push({ path, message: "값이 필요하다 (default 없음)" });
      continue;
    }
    const r = resolveValue(def, raw, path);
    if (r.ok) resolved[key] = r.value;
    else issues.push(...r.issues);
  }
  return issues.length ? fail(issues) : ok(resolved);
}
