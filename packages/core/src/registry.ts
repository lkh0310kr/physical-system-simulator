/**
 * Registry: Model · Capability · Behavior를 ID로 등록·조회하고, 서로의 참조가 맞는지 검사한다.
 * 개별 정의의 형식 검사는 스키마가, 정의 사이의 관계 검사는 `validate()`가 맡는다.
 */
import type { Behavior } from "./behavior.ts";
import type { Capability } from "./capability.ts";
import { fail, type Issue, joinPath, ok, type Result } from "./issues.ts";
import { type Model, resolveBehaviorId } from "./model.ts";
import { resolveProperties } from "./property.ts";

export interface Registry {
  addCapability(capability: Capability): Result<Capability>;
  addModel(model: Model): Result<Model>;
  addBehavior(behavior: Behavior): Result<Behavior>;

  getCapability(id: string): Capability | undefined;
  getModel(id: string): Model | undefined;
  getBehavior(id: string): Behavior | undefined;

  capabilities(): readonly Capability[];
  models(): readonly Model[];
  behaviors(): readonly Behavior[];

  /** 등록된 모든 정의 사이의 참조 무결성 검사. 문제가 없으면 빈 배열. */
  validate(): readonly Issue[];
}

function addTo<T extends { id: string }>(map: Map<string, T>, item: T): Result<T> {
  if (map.has(item.id)) return fail([{ path: item.id, message: "이미 등록된 ID" }]);
  map.set(item.id, item);
  return ok(item);
}

export function createRegistry(): Registry {
  const capabilities = new Map<string, Capability>();
  const models = new Map<string, Model>();
  const behaviors = new Map<string, Behavior>();

  function validateModel(model: Model): Issue[] {
    const at = (...parts: (string | number)[]) => `${model.id}:${joinPath(...parts)}`;
    const issues: Issue[] = [];

    const props = resolveProperties(model.propertySchema, model.properties);
    if (!props.ok)
      issues.push(...props.issues.map((i) => ({ ...i, path: at("properties", i.path) })));

    model.components.forEach((c, i) => {
      if (!models.has(c.model)) {
        issues.push({
          path: at("components", i, "model"),
          message: `등록되지 않은 Model: ${c.model}`,
        });
      }
    });

    model.capabilities.forEach((binding, i) => {
      const capability = capabilities.get(binding.capability);
      if (!capability) {
        issues.push({
          path: at("capabilities", i, "capability"),
          message: `등록되지 않은 Capability: ${binding.capability}`,
        });
        return;
      }
      const config = resolveProperties(capability.parameters, binding.config);
      if (!config.ok) {
        issues.push(
          ...config.issues.map((x) => ({ ...x, path: at("capabilities", i, "config", x.path) })),
        );
      }
      const behaviorId = resolveBehaviorId(binding, capability);
      if (!behaviorId) {
        issues.push({
          path: at("capabilities", i),
          message: `Behavior가 없다: 바인딩에 behavior를 지정하거나 ${capability.id}에 defaultBehavior가 있어야 한다`,
        });
      } else if (!behaviors.has(behaviorId)) {
        issues.push({
          path: at("capabilities", i),
          message: `등록되지 않은 Behavior: ${behaviorId}`,
        });
      }
    });
    return issues;
  }

  /** Components 참조 그래프의 순환을 찾는다. */
  function findCycles(): Issue[] {
    const issues: Issue[] = [];
    const state = new Map<string, "visiting" | "done">();
    const visit = (id: string, trail: string[]) => {
      if (state.get(id) === "done") return;
      if (state.get(id) === "visiting") {
        const cycle = [...trail.slice(trail.indexOf(id)), id];
        issues.push({ path: `${id}:components`, message: `Component 순환: ${cycle.join(" → ")}` });
        return;
      }
      state.set(id, "visiting");
      for (const c of models.get(id)?.components ?? []) {
        if (models.has(c.model)) visit(c.model, [...trail, id]);
      }
      state.set(id, "done");
    };
    for (const id of models.keys()) visit(id, []);
    return issues;
  }

  return {
    addCapability: (c) => addTo(capabilities, c),
    addModel: (m) => addTo(models, m),
    addBehavior: (b) => addTo(behaviors, b),
    getCapability: (id) => capabilities.get(id),
    getModel: (id) => models.get(id),
    getBehavior: (id) => behaviors.get(id),
    capabilities: () => [...capabilities.values()],
    models: () => [...models.values()],
    behaviors: () => [...behaviors.values()],
    validate: () => [...[...models.values()].flatMap(validateModel), ...findCycles()],
  };
}
