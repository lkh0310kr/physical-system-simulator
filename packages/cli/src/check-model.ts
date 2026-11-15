/**
 * 새 Model/Capability 파일 검증 (P8-T5): 에이전트가 쓴 정의를 표준 라이브러리 위에 올려 보고,
 * 스키마·교차 참조 오류와 "사람이 확인해야 할 것"(출처 없음, 가정 목록, 치수 없음)을 함께 돌려 준다.
 * 파일은 고치지 않는다 — 통과해도 사람이 보고 승인해야 System에서 쓴다.
 */
import { readFileSync } from "node:fs";
import { type Issue, loadLibrary, type Result } from "@physisim/core";
import { createStandardRegistry } from "@physisim/models";
import { describeModel } from "./catalog.ts";

export interface ModelReview {
  /** 오류는 없지만 사람이 확인할 항목. */
  readonly notes: readonly string[];
  /** `describeModel` 요약 (Capability 파일이면 없다). */
  readonly summary: string | undefined;
  readonly id: string;
}

export function checkModelFile(path: string): Result<ModelReview> {
  let def: unknown;
  try {
    def = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    return { ok: false, issues: [{ path, message: (e as Error).message }] };
  }
  const id = (def as { id?: unknown } | null)?.id;
  if (typeof id !== "string" || !/^(model|capability)\./.test(id)) {
    return {
      ok: false,
      issues: [
        { path: `${path}: id`, message: '"id"가 "model." 또는 "capability."로 시작해야 한다' },
      ],
    };
  }
  const isModel = id.startsWith("model.");
  const attempt = (d: unknown) =>
    loadLibrary(isModel ? { models: [d] } : { capabilities: [d] }, createStandardRegistry());
  let lib = attempt(def);
  let renamed = false;
  // 표준 라이브러리에 이미 있는 정의(수정본 검토)는 임시 이름으로 바꿔 내용만 검증한다
  if (!lib.ok && lib.issues.some((i) => i.message.includes("이미 등록된 ID"))) {
    lib = attempt({ ...(def as object), id: `${id}-check-copy` });
    renamed = true;
  }
  if (!lib.ok) {
    return {
      ok: false,
      issues: lib.issues.map((i): Issue => ({ ...i, path: `${path}: ${i.path}` })),
    };
  }
  const notes: string[] = [];
  const model = isModel ? lib.value.getModel(renamed ? `${id}-check-copy` : id) : undefined;
  if (renamed)
    notes.push(
      "같은 ID가 표준 라이브러리에 이미 있다 — 내용만 검증했다 (System에서 쓰려면 다른 ID로)",
    );
  if (model) {
    const meta = (model.metadata ?? {}) as Record<string, unknown>;
    if (!meta.source)
      notes.push("metadata.source가 없다 — 값의 출처(제품 페이지·데이터시트)를 적는다");
    if (!meta.fidelity) notes.push("metadata.fidelity가 없다 (ideal / approximate / detailed)");
    const assumptions = Array.isArray(meta.assumptions) ? meta.assumptions.length : 0;
    notes.push(
      assumptions
        ? `미확인 가정 ${assumptions}개 — metadata.assumptions를 사람이 검토한다`
        : "metadata.assumptions가 비어 있다 — 확인 못 한 값이 없다고 주장하는 것이니 출처를 확인한다",
    );
    if (!model.body)
      notes.push("body(기구 치수)가 없다 — 3D에서 자리표시로 보이고 케이스에 못 쓴다");
    for (const key of Object.keys(model.properties ?? {})) {
      if (!(model.propertySchema ?? {})[key])
        notes.push(`properties.${key}가 propertySchema에 없다`);
    }
  }
  return {
    ok: true,
    value: {
      id,
      notes,
      summary: model ? describeModel(lib.value, model) : undefined,
    },
  };
}

export function formatReview(r: ModelReview): string {
  return [
    `✓ ${r.id} — 스키마·참조 검증 통과`,
    ...(r.summary ? ["", r.summary] : []),
    "",
    "사람이 확인할 것",
    ...r.notes.map((n) => `  - ${n}`),
    "",
    "승인하려면 파일을 System의 library에 추가한다. 이 명령은 아무것도 고치지 않는다.",
  ].join("\n");
}
