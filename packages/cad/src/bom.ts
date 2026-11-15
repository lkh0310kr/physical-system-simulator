/**
 * BOM·구매 리스트 (P7-T19): Model의 `metadata.bom`(판매처·품명·품번·링크)에서 만든다. 구매는 사람이 한다.
 * `metadata.bom`이 없는 Instance는 "모델링 전용"(회로 동작 모델, 가상 부품)으로 따로 보여 준다.
 */
import type { LoadedSystem } from "@physisim/core";
import { z } from "zod";
import type { ProcessProfile } from "./process.ts";

const BomSchema = z.object({
  vendor: z.string(),
  name: z.string(),
  mpn: z.string().optional(),
  url: z.string().optional(),
});

export interface BomLine {
  readonly model: string;
  readonly instances: readonly string[];
  readonly quantity: number;
  readonly vendor: string;
  readonly name: string;
  readonly mpn: string | undefined;
  readonly url: string | undefined;
  /** 이 부품 Model이 가정으로 남긴 항목. */
  readonly assumptions: readonly string[];
}

export interface PrintedLine {
  readonly name: string;
  /** 형상 부피 [mm³] (속이 찬 상태). */
  readonly volumeMm3: number;
  /** 속이 찬 상태의 무게 상한 [g]. 슬라이서 충전율에 따라 실제는 더 가볍다. */
  readonly massG: number;
}

export interface Bom {
  readonly purchased: readonly BomLine[];
  readonly printed: readonly PrintedLine[];
  /** BOM 정보가 없어 구매 목록에 못 올린 Instance (모델링 전용 또는 정보 누락). */
  readonly modelOnly: readonly { readonly instance: string; readonly model: string }[];
}

export function bomOf(
  loaded: LoadedSystem,
  printed: readonly { name: string; volumeMm3: number }[],
  profile: ProcessProfile,
): Bom {
  const lines = new Map<
    string,
    { instances: string[]; line: Omit<BomLine, "instances" | "quantity"> }
  >();
  const modelOnly: { instance: string; model: string }[] = [];
  for (const inst of loaded.doc.instances) {
    const meta = loaded.registry.getModel(inst.model)?.metadata;
    const parsed = BomSchema.safeParse(meta?.bom);
    if (!parsed.success) {
      modelOnly.push({ instance: inst.id, model: inst.model });
      continue;
    }
    const hit = lines.get(inst.model);
    if (hit) hit.instances.push(inst.id);
    else
      lines.set(inst.model, {
        instances: [inst.id],
        line: {
          model: inst.model,
          vendor: parsed.data.vendor,
          name: parsed.data.name,
          mpn: parsed.data.mpn,
          url: parsed.data.url,
          assumptions: Array.isArray(meta?.assumptions) ? (meta.assumptions as string[]) : [],
        },
      });
  }
  return {
    purchased: [...lines.values()].map((l) => ({
      ...l.line,
      instances: l.instances,
      quantity: l.instances.length,
    })),
    printed: printed.map((p) => ({
      name: p.name,
      volumeMm3: p.volumeMm3,
      massG: (p.volumeMm3 / 1000) * profile.density,
    })),
    modelOnly,
  };
}

const csvCell = (v: string | number | undefined) => `"${String(v ?? "").replaceAll('"', '""')}"`;

/** 스프레드시트에 붙여 넣을 수 있는 CSV (구매 부품만). */
export function bomCsv(bom: Bom): string {
  const rows = [["수량", "품명", "판매처", "품번", "링크", "Instance"]];
  for (const l of bom.purchased)
    rows.push([
      String(l.quantity),
      l.name,
      l.vendor,
      l.mpn ?? "",
      l.url ?? "",
      l.instances.join(" "),
    ]);
  return `${rows.map((r) => r.map(csvCell).join(",")).join("\n")}\n`;
}

/** 사람이 읽는 BOM 요약. */
export function formatBom(bom: Bom, profile: ProcessProfile): string {
  const out: string[] = ["구매 부품"];
  for (const l of bom.purchased) {
    out.push(`  ${l.quantity} × ${l.name} — ${l.vendor}${l.mpn ? ` (${l.mpn})` : ""}`);
    if (l.url) out.push(`      ${l.url}`);
    if (l.assumptions.length)
      out.push(`      확인 필요 ${l.assumptions.length}개: ${l.assumptions.join(" / ")}`);
  }
  out.push("", `3D 프린트 부품 (${profile.name})`);
  for (const p of bom.printed)
    out.push(
      `  ${p.name}: ${(p.volumeMm3 / 1000).toFixed(1)} cm³, 속 채움 100% 기준 ≤ ${p.massG.toFixed(1)} g`,
    );
  if (bom.modelOnly.length)
    out.push("", `모델링 전용(구매 목록 제외): ${bom.modelOnly.map((m) => m.instance).join(", ")}`);
  return out.join("\n");
}
