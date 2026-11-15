/**
 * JSON 로더: 신뢰할 수 없는 입력(파일, Agent 출력)을 검증해 정의로 만들고 Registry에 싣는다.
 * 모든 실패는 throw 대신 `Issue[]`로 돌려준다.
 */
import type { z } from "zod";
import type { Behavior } from "./behavior.ts";
import { type Capability, CapabilitySchema } from "./capability.ts";
import { fail, type Issue, joinPath, ok, type Result } from "./issues.ts";
import { type Model, ModelSchema } from "./model.ts";
import { createRegistry, type Registry } from "./registry.ts";

/** Zod 오류를 `Issue[]`로. */
export function fromZodError(error: z.ZodError, basePath = ""): Issue[] {
  return error.issues.map((i) => ({
    path: joinPath(basePath, ...i.path.map((p) => (typeof p === "symbol" ? String(p) : p))),
    message: i.message,
  }));
}

/** 오류 경로 앞에 붙일 이름: 입력에 쓸 만한 `id`가 있으면 그것, 없으면 `fallback`. */
function labelOf(json: unknown, fallback: string): string {
  const id = (json as { id?: unknown } | null)?.id;
  return typeof id === "string" && id ? `${id}:` : fallback;
}

function parseWith<T>(schema: z.ZodType<T>, json: unknown, label: string): Result<T> {
  const r = schema.safeParse(json);
  if (r.success) return ok(r.data);
  return fail(fromZodError(r.error).map((i) => ({ ...i, path: `${label}${i.path}` })));
}

export const parseCapability = (json: unknown): Result<Capability> =>
  parseWith(CapabilitySchema, json, labelOf(json, ""));

export const parseModel = (json: unknown): Result<Model> =>
  parseWith(ModelSchema, json, labelOf(json, ""));

export interface LibraryInput {
  readonly capabilities?: readonly unknown[];
  readonly models?: readonly unknown[];
  readonly behaviors?: readonly Behavior[];
}

/**
 * 정의 묶음을 검증해 Registry에 싣고 참조 무결성까지 검사한다.
 * 하나라도 문제가 있으면 모든 문제를 모아 실패로 돌려준다.
 */
export function loadLibrary(input: LibraryInput, registry = createRegistry()): Result<Registry> {
  const issues: Issue[] = [];
  const collect = <T>(r: Result<T>) => {
    if (!r.ok) issues.push(...r.issues);
  };

  for (const b of input.behaviors ?? []) collect(registry.addBehavior(b));
  (input.capabilities ?? []).forEach((json, i) => {
    const r = parseWith(CapabilitySchema, json, labelOf(json, `capabilities[${i}]:`));
    collect(r.ok ? registry.addCapability(r.value) : r);
  });
  (input.models ?? []).forEach((json, i) => {
    const r = parseWith(ModelSchema, json, labelOf(json, `models[${i}]:`));
    collect(r.ok ? registry.addModel(r.value) : r);
  });

  if (issues.length === 0) issues.push(...registry.validate());
  return issues.length ? fail(issues) : ok(registry);
}
