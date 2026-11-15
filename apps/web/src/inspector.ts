/** 인스펙터 로직 (순수 함수): 입력 문자열 해석, 단일 속성 검증, 표시용 문자열. */
import { type PropertyDefinition, type PropertyValue, resolveProperties } from "@physisim/core";

/** 입력란 문자열 → 문서에 쓸 값. 숫자만 있으면 숫자, 아니면 문자열 그대로 ("4.7kΩ"). */
export function parseInput(def: PropertyDefinition, text: string): PropertyValue {
  const t = text.trim();
  if (def.type === "boolean") return t === "true";
  if (
    (def.type === "number" || def.type === "integer") &&
    /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)
  )
    return Number(t);
  return t;
}

/** 이 값이 정의에 맞는지. 맞으면 `undefined`, 아니면 오류 메시지. */
export function checkValue(def: PropertyDefinition, value: PropertyValue): string | undefined {
  const r = resolveProperties({ v: def }, { v: value });
  return r.ok ? undefined : r.issues[0]?.message;
}

/** 입력란에 보여 줄 문자열: 단위가 있으면 숫자 뒤에 붙인다. */
export function displayValue(def: PropertyDefinition, value: PropertyValue | undefined): string {
  if (value === undefined) return "";
  if (def.type === "number" && typeof value === "number" && def.unit) return `${value} ${def.unit}`;
  return String(value);
}
