/** 사람이 읽는 출력 형식. */
import type { PropertyValue, Registry, SystemDoc } from "@physisim/core";

const PREFIXES: [number, string][] = [
  [1e9, "G"],
  [1e6, "M"],
  [1e3, "k"],
  [1, ""],
  [1e-3, "m"],
  [1e-6, "µ"],
  [1e-9, "n"],
];

/** SI 값을 접두어 붙여 표시 (0.0118, "A" → "11.8 mA"). */
export function withPrefix(value: number, unit: string): string {
  if (value === 0) return `0 ${unit}`;
  const [scale, prefix] = PREFIXES.find(([s]) => Math.abs(value) >= s * 0.9995) ?? [1e-9, "n"];
  return `${Number((value / scale).toPrecision(3))} ${prefix}${unit}`;
}

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
