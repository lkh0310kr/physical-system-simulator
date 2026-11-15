/** 로드된 System → 검증된 케이스. 에러가 있으면 형상은 주지만 `ok`가 false다. */
import type { LoadedSystem } from "@physisim/core";
import { type CaseGeometry, type CaseInput, caseInputOf, generateCase } from "./case.ts";
import type { ProcessProfile } from "./process.ts";
import { type CaseIssue, hasErrors, type ValidateOptions, validateCase } from "./validate.ts";

export interface CaseResult {
  readonly ok: boolean;
  readonly input: CaseInput;
  readonly geometry: CaseGeometry;
  readonly issues: readonly CaseIssue[];
}

export async function buildCase(
  loaded: LoadedSystem,
  profile: ProcessProfile,
  options: ValidateOptions = {},
): Promise<CaseResult> {
  const input = caseInputOf(loaded);
  const geometry = await generateCase(input, profile);
  const issues = await validateCase(input, geometry, profile, options);
  return { ok: !hasErrors(issues), input, geometry, issues };
}
