/**
 * 제작 공정 프로필 (P7-T15): 공정마다 다른 규칙을 코드에서 떼어 설정으로 둔다.
 * 케이스 생성·검증은 프로필 값만 읽으므로 SLA·CNC 같은 공정은 프로필만 추가하면 된다.
 * 길이는 mm.
 */
import { z } from "zod";

const mm = z.number().positive();

export const ProcessProfileSchema = z
  .strictObject({
    id: z.string().min(1),
    name: z.string().min(1),
    /** 출처·근거. 값이 확인된 것인지 일반적인 경험치인지 적는다. */
    note: z.string().optional(),
    /** 가장 얇아도 되는 벽. 이보다 얇으면 검증이 거부한다. */
    minWall: mm,
    /** 케이스 벽 기본 두께 (minWall 이상). */
    wall: mm,
    /** 바닥판·뚜껑 판 두께. */
    plate: mm,
    /** 가장 작은 구멍 지름. */
    minHole: mm,
    /** 받침 없이 건너 지를 수 있는 최대 폭. 넘으면 경고. */
    bridgeLimit: mm,
    /** 부품과 케이스 안쪽 면 사이 여유 (한 면당). */
    partClearance: mm,
    /** 개구부가 통과 부품보다 더 큰 정도 (한 면당). */
    openingClearance: mm,
    /** 맞물리는 두 면 사이 틈 (한 면당). */
    fitGap: mm,
    /** 스냅 돌기 반지름 (혀 바깥면에서 뚜껑 홈으로). 0이면 돌기 없이 마찰로만 닫는다. */
    snapBump: z.number().min(0),
    /** 한 번에 출력할 수 있는 크기 x·y·z. */
    buildVolume: z.tuple([mm, mm, mm]),
    /** 재료 밀도 [g/cm³] — BOM의 무게 추정용. */
    density: mm,
  })
  .refine((p) => p.wall >= p.minWall && p.plate >= p.minWall, {
    message: "wall과 plate는 minWall 이상이어야 한다",
  });

export type ProcessProfile = z.output<typeof ProcessProfileSchema>;

/**
 * FDM(필라멘트 적층) 기본 프로필. 노즐 0.4 mm, PLA 기준의 **범용 경험치**이며 제품 사양이 아니다.
 * 프린터·재료에 맞춰 프로필 파일(JSON)로 덮어쓴다.
 */
export const fdmProfile: ProcessProfile = {
  id: "fdm",
  name: "FDM (노즐 0.4 mm, PLA)",
  note: "범용 경험치(가정): 0.4 mm 노즐 3줄 벽 1.2 mm, 틈 0.2~0.3 mm. 프린터별로 교정 필요",
  minWall: 1.2,
  wall: 2.8,
  plate: 1.6,
  minHole: 1.0,
  bridgeLimit: 12,
  partClearance: 0.3,
  openingClearance: 0.2,
  fitGap: 0.2,
  snapBump: 0.4,
  buildVolume: [220, 220, 250],
  density: 1.24,
};

export const profiles: Readonly<Record<string, ProcessProfile>> = { fdm: fdmProfile };

/** 이름 또는 JSON 객체로 프로필을 얻는다. 기본값에 덮어쓰는 부분 객체도 받는다. */
export function resolveProfile(
  input: string | Partial<ProcessProfile> | undefined,
): { ok: true; value: ProcessProfile } | { ok: false; message: string } {
  if (input === undefined) return { ok: true, value: fdmProfile };
  if (typeof input === "string") {
    const found = profiles[input];
    return found
      ? { ok: true, value: found }
      : { ok: false, message: `알 수 없는 공정 "${input}" (${Object.keys(profiles).join(", ")})` };
  }
  const parsed = ProcessProfileSchema.safeParse({ ...fdmProfile, ...input });
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, message: parsed.error.issues.map((i) => i.message).join("; ") };
}
