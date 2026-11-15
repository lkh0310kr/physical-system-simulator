/** 부품 탐색 (`physisim models`). 사람과 에이전트가 쓸 수 있는 Model을 찾는다. */
import type { Model, Registry } from "@physisim/core";

/** ID·이름·분류·설명에 검색어가 들어간 Model (대소문자 무시). 검색어가 없으면 전부. */
export function searchModels(registry: Registry, query = ""): Model[] {
  const q = query.toLowerCase();
  return registry
    .models()
    .filter((m) =>
      [m.id, m.name, m.category, m.description ?? ""].some((t) => t.toLowerCase().includes(q)),
    );
}

const valueText = (value: unknown, unit: string | undefined) =>
  typeof value === "number" && unit ? `${value} ${unit}` : String(value);

/** 여러 줄 요약. */
export function describeModel(registry: Registry, m: Model): string {
  const lines = [`${m.id}  ${m.name}  [${m.category}]`];
  if (m.description) lines.push(`  ${m.description}`);
  if (m.ports.length) {
    lines.push(
      `  ports       ${m.ports.map((p) => (p.ground ? `${p.name}(GND)` : p.name)).join(", ")}`,
    );
  }
  const props = Object.entries(m.propertySchema).map(([k, def]) => {
    const value = m.properties[k] ?? def.default;
    const unit = def.type === "number" ? def.unit : undefined;
    return value === undefined ? `${k}=?` : `${k}=${valueText(value, unit)}`;
  });
  if (props.length) lines.push(`  properties  ${props.join(", ")}`);
  for (const b of m.capabilities) {
    const config = Object.entries(b.config).map(([k, v]) => `${k}=${v}`);
    const behavior = b.behavior ?? registry.getCapability(b.capability)?.defaultBehavior ?? "?";
    lines.push(
      `  capability  ${b.capability}${config.length ? ` (${config.join(", ")})` : ""} → ${behavior}`,
    );
  }
  if (m.components.length) {
    lines.push(`  components  ${m.components.map((c) => `${c.name}: ${c.model}`).join(", ")}`);
  }
  return lines.join("\n");
}
