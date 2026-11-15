/** 사람이 읽는 출력 형식. */
import { formatQuantity, type PropertyValue, type Registry, type SystemDoc } from "@physisim/core";

/** SI 값을 접두어 붙여 표시 (0.0118, "A" → "11.8 mA"). */
export const withPrefix = formatQuantity;

/** 신호 `instance.output`의 단위를 Capability outputs 정의에서 찾는다. */
export function unitOf(registry: Registry, doc: SystemDoc, signal: string): string | undefined {
  const dot = signal.indexOf(".");
  const inst = doc.instances.find((i) => i.id === signal.slice(0, dot));
  const key = signal.slice(dot + 1);
  for (const b of registry.getModel(inst?.model ?? "")?.capabilities ?? []) {
    const def = registry.getCapability(b.capability)?.outputs[key];
    if (def?.type === "number") return def.unit;
  }
  return undefined;
}

export function formatValue(value: PropertyValue, unit: string | undefined): string {
  if (typeof value === "boolean") return value ? "HIGH" : "LOW";
  if (typeof value === "number")
    return unit ? withPrefix(value, unit) : String(Number(value.toPrecision(3)));
  return value;
}

export const formatTime = (s: number): string => `${s.toFixed(3)} s`;
