/**
 * Instance: Model을 바탕으로 시뮬레이션 안에 만들어진 객체 (스펙 §7).
 * Model은 참조만 하고, 속성 override와 Capability 바인딩별 State를 가진다. 전부 순수 JSON.
 */
import { z } from "zod";
import { ModelId } from "./ids.ts";
import { fail, type Issue, joinPath, ok, type Result } from "./issues.ts";
import { resolveBehaviorId } from "./model.ts";
import { PropertyValueSchema, type ResolvedValues, resolveProperties } from "./property.ts";
import type { Registry } from "./registry.ts";

/** System 문서 안의 Instance 선언. */
export const InstanceDeclSchema = z.strictObject({
  /** System 안에서 유일한 이름 (예: "uno", "led1"). */
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/, { message: "소문자로 시작하는 이름 (a-z0-9_-)" }),
  model: ModelId,
  /** Model 속성값 override. */
  properties: z.record(z.string(), PropertyValueSchema).default({}),
  /** MCU 프로그램 파일 (System 문서 기준 상대 경로). 엔진은 읽지 않고, 실행 도구(CLI 등)가 소스를 넘긴다. */
  program: z.string().min(1).optional(),
});
export type InstanceDecl = z.output<typeof InstanceDeclSchema>;

export interface Instance {
  readonly id: string;
  readonly model: string;
  /** Model 값 + override, SI로 정규화. */
  readonly properties: ResolvedValues;
  /** Capability ID → 그 바인딩의 Behavior 상태. */
  readonly state: Readonly<Record<string, unknown>>;
}

/** 선언으로부터 Instance를 만든다. Registry는 `validate()`를 통과한 상태여야 한다. */
export function createInstance(
  registry: Registry,
  decl: InstanceDecl,
  basePath = decl.id,
): Result<Instance> {
  const model = registry.getModel(decl.model);
  if (!model)
    return fail([
      { path: joinPath(basePath, "model"), message: `등록되지 않은 Model: ${decl.model}` },
    ]);

  const props = resolveProperties(
    model.propertySchema,
    { ...model.properties, ...decl.properties },
    joinPath(basePath, "properties"),
  );
  if (!props.ok) return props;

  const issues: Issue[] = [];
  const state: Record<string, unknown> = {};
  for (const binding of model.capabilities) {
    const capability = registry.getCapability(binding.capability);
    const behaviorId = capability && resolveBehaviorId(binding, capability);
    const behavior = behaviorId ? registry.getBehavior(behaviorId) : undefined;
    const config = capability
      ? resolveProperties(capability.parameters, binding.config)
      : undefined;
    if (!behavior || !config?.ok) {
      issues.push({
        path: basePath,
        message: `${model.id}의 ${binding.capability} 바인딩을 해석할 수 없다 (Registry 검증 필요)`,
      });
      continue;
    }
    state[binding.capability] = behavior.init({ properties: props.value, config: config.value });
  }
  if (issues.length) return fail(issues);
  return ok({ id: decl.id, model: model.id, properties: props.value, state });
}
