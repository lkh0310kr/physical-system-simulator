import { z } from "zod";

/** ID 종류. ID는 `<kind>.<이름>` 형식이며 이름은 소문자 kebab-case 조각을 `.`으로 잇는다. */
export type IdKind = "model" | "capability" | "behavior";

const SEGMENT = "[a-z0-9]+(?:-[a-z0-9]+)*";

export function idSchema(kind: IdKind) {
  return z.string().regex(new RegExp(`^${kind}\\.${SEGMENT}(?:\\.${SEGMENT})*$`), {
    message: `"${kind}.이름" 형식의 소문자 kebab-case ID여야 한다 (예: ${kind}.my-part)`,
  });
}

export const ModelId = idSchema("model");
export const CapabilityId = idSchema("capability");
export const BehaviorId = idSchema("behavior");
