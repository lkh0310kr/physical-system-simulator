/**
 * System 문서 편집 연산. 파일에 적힌 JSON을 그대로 받아 새 JSON을 돌려준다 (모르는 필드는 보존).
 * 화면 배치는 `layout.instances.<id> = { x, y, rotate }`에 둔다.
 */

type Json = Record<string, unknown>;
type Placement = { x: number; y: number; rotate?: number };

const obj = (v: unknown): Json =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};
const instancesOf = (doc: Json) => (Array.isArray(doc.instances) ? (doc.instances as Json[]) : []);
const connectionsOf = (doc: Json) =>
  Array.isArray(doc.connections) ? (doc.connections as [string, string][]) : [];
const layoutOf = (doc: Json) => obj(obj(doc.layout).instances) as Record<string, Placement>;

function withLayout(doc: Json, instances: Record<string, Placement>): Json {
  return { ...doc, layout: { ...obj(doc.layout), instances } };
}

/** 모델 ID의 마지막 조각 + 번호로 비어 있는 ID를 만든다 (model.led → led2). */
export function nextInstanceId(doc: unknown, modelId: string): string {
  const base = (modelId.split(".").pop() ?? "part").replace(/[^a-z0-9-]/g, "") || "part";
  const taken = new Set(instancesOf(obj(doc)).map((i) => String(i.id)));
  let n = 1;
  while (taken.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

export function addInstance(
  doc: unknown,
  modelId: string,
  at: { x: number; y: number },
): { doc: Json; id: string } {
  const d = obj(doc);
  const id = nextInstanceId(d, modelId);
  const next = { ...d, instances: [...instancesOf(d), { id, model: modelId }] };
  return { doc: withLayout(next, { ...layoutOf(d), [id]: { x: at.x, y: at.y } }), id };
}

export function moveInstance(doc: unknown, id: string, x: number, y: number): Json {
  const d = obj(doc);
  const layout = layoutOf(d);
  return withLayout(d, { ...layout, [id]: { ...layout[id], x, y } });
}

/** 시계 방향 90° 회전. 배치가 없으면 `fallback` 위치에서 시작한다. */
export function rotateInstance(doc: unknown, id: string, fallback: Placement): Json {
  const d = obj(doc);
  const layout = layoutOf(d);
  const cur = layout[id] ?? fallback;
  return withLayout(d, { ...layout, [id]: { ...cur, rotate: ((cur.rotate ?? 0) + 90) % 360 } });
}

/** Instance와 그에 닿은 연결·배치를 함께 지운다. */
export function removeInstance(doc: unknown, id: string): Json {
  const d = obj(doc);
  const { [id]: _, ...layout } = layoutOf(d);
  const touches = (ref: string) => ref.slice(0, ref.indexOf(":")) === id;
  return withLayout(
    {
      ...d,
      instances: instancesOf(d).filter((i) => i.id !== id),
      connections: connectionsOf(d).filter(([a, b]) => !touches(a) && !touches(b)),
    },
    layout,
  );
}

/** 두 Port를 잇는다. 같은 Port끼리거나 이미 있는 연결이면 그대로. */
export function connect(doc: unknown, a: string, b: string): Json {
  const d = obj(doc);
  const exists = connectionsOf(d).some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  if (a === b || exists) return d;
  return { ...d, connections: [...connectionsOf(d), [a, b]] };
}

export function disconnect(doc: unknown, index: number): Json {
  const d = obj(doc);
  return { ...d, connections: connectionsOf(d).filter((_, i) => i !== index) };
}

/** Instance 속성 override. `value`가 undefined면 override를 지워 Model 값으로 돌아간다. */
export function setProperty(doc: unknown, id: string, key: string, value: unknown): Json {
  const d = obj(doc);
  return {
    ...d,
    instances: instancesOf(d).map((inst) => {
      if (inst.id !== id) return inst;
      const { [key]: _, ...rest } = obj(inst.properties);
      const properties = value === undefined ? rest : { ...rest, [key]: value };
      const { properties: __, ...base } = inst;
      return Object.keys(properties).length ? { ...base, properties } : base;
    }),
  };
}

/**
 * Biome JSON 포맷과 같은 모양으로 직렬화한다: 한 줄(폭 100)에 들어가면 인라인, 아니면 여러 줄.
 * 에디터가 저장한 파일이 lint를 깨지 않게 하기 위함.
 */
export function formatJson(value: unknown, width = 100): string {
  const inline = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.map(inline).join(", ")}]`;
    if (v && typeof v === "object") {
      const entries = Object.entries(v).filter(([, x]) => x !== undefined);
      return entries.length
        ? `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(", ")} }`
        : "{}";
    }
    return JSON.stringify(v);
  };
  const fmt = (v: unknown, indent: string, prefix: number): string => {
    const one = inline(v);
    if (!v || typeof v !== "object") return one;
    if (indent.length + prefix + one.length <= width) return one;
    const inner = `${indent}  `;
    if (Array.isArray(v))
      return `[\n${v.map((x) => `${inner}${fmt(x, inner, 1)}`).join(",\n")}\n${indent}]`;
    const entries = Object.entries(v).filter(([, x]) => x !== undefined);
    return `{\n${entries
      .map(([k, x]) => {
        const key = `${JSON.stringify(k)}: `;
        return `${inner}${key}${fmt(x, inner, key.length + 1)}`;
      })
      .join(",\n")}\n${indent}}`;
  };
  // 최상위 객체는 항상 여러 줄로 쓴다 (Biome도 원본 줄바꿈을 유지한다).
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value).filter(([, x]) => x !== undefined);
    return `{\n${entries.map(([k, x]) => `  ${JSON.stringify(k)}: ${fmt(x, "  ", JSON.stringify(k).length + 3)}`).join(",\n")}\n}\n`;
  }
  return `${fmt(value, "", 0)}\n`;
}
