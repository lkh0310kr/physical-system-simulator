/**
 * 물리 단위. 모든 값은 내부적으로 SI 기본 단위의 숫자로 다룬다.
 * 단위는 "SI 차원 지수 벡터 + SI로의 배율"로 표현하며, 문자열("mA", "kΩ", "N*m", "m/s^2")에서 파싱한다.
 */

/** SI 기본 차원 지수: [m, kg, s, A, K, mol, cd]. */
export type Dimension = readonly [number, number, number, number, number, number, number];

export interface Unit {
  readonly dimension: Dimension;
  /** 이 단위의 값 1이 SI 기본 단위로 얼마인지. */
  readonly scale: number;
}

export class UnitError extends Error {
  override name = "UnitError";
}

const dim = (m = 0, kg = 0, s = 0, A = 0, K = 0, mol = 0, cd = 0): Dimension => [
  m,
  kg,
  s,
  A,
  K,
  mol,
  cd,
];

const BASE_UNITS: Readonly<Record<string, Unit>> = {
  m: { dimension: dim(1), scale: 1 },
  g: { dimension: dim(0, 1), scale: 1e-3 },
  s: { dimension: dim(0, 0, 1), scale: 1 },
  A: { dimension: dim(0, 0, 0, 1), scale: 1 },
  K: { dimension: dim(0, 0, 0, 0, 1), scale: 1 },
  mol: { dimension: dim(0, 0, 0, 0, 0, 1), scale: 1 },
  cd: { dimension: dim(0, 0, 0, 0, 0, 0, 1), scale: 1 },
  V: { dimension: dim(2, 1, -3, -1), scale: 1 },
  Ω: { dimension: dim(2, 1, -3, -2), scale: 1 },
  ohm: { dimension: dim(2, 1, -3, -2), scale: 1 },
  W: { dimension: dim(2, 1, -3), scale: 1 },
  J: { dimension: dim(2, 1, -2), scale: 1 },
  N: { dimension: dim(1, 1, -2), scale: 1 },
  Hz: { dimension: dim(0, 0, -1), scale: 1 },
  C: { dimension: dim(0, 0, 1, 1), scale: 1 },
  F: { dimension: dim(-2, -1, 4, 2), scale: 1 },
  H: { dimension: dim(2, 1, -2, -2), scale: 1 },
  // 각도는 무차원. rad이 기준.
  rad: { dimension: dim(), scale: 1 },
  deg: { dimension: dim(), scale: Math.PI / 180 },
};

const PREFIXES: Readonly<Record<string, number>> = {
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  µ: 1e-6,
  m: 1e-3,
  k: 1e3,
  M: 1e6,
  G: 1e9,
};

/** 무차원 단위 (단위 문자열 ""). */
export const DIMENSIONLESS: Unit = { dimension: dim(), scale: 1 };

function lookupSymbol(symbol: string): Unit {
  const exact = BASE_UNITS[symbol];
  if (exact) return exact;
  const prefix = PREFIXES[symbol[0] ?? ""];
  const base = BASE_UNITS[symbol.slice(1)];
  if (prefix !== undefined && base)
    return { dimension: base.dimension, scale: base.scale * prefix };
  throw new UnitError(`알 수 없는 단위: "${symbol}"`);
}

function power(unit: Unit, exp: number): Unit {
  return {
    dimension: unit.dimension.map((d) => d * exp) as unknown as Dimension,
    scale: unit.scale ** exp,
  };
}

function multiply(a: Unit, b: Unit): Unit {
  return {
    dimension: a.dimension.map((d, i) => d + (b.dimension[i] ?? 0)) as unknown as Dimension,
    scale: a.scale * b.scale,
  };
}

function parseProduct(text: string, original: string): Unit {
  return text
    .split(/[*·]/)
    .map((factor) => {
      const [symbol = "", exp, ...rest] = factor.trim().split("^");
      const e = exp === undefined ? 1 : Number(exp);
      if (!symbol || rest.length > 0 || !Number.isInteger(e)) {
        throw new UnitError(`잘못된 단위 표기: "${original}"`);
      }
      return power(lookupSymbol(symbol), e);
    })
    .reduce(multiply, DIMENSIONLESS);
}

const cache = new Map<string, Unit>();

/** `"mA"`, `"kΩ"`, `"N*m"`, `"m/s^2"` 같은 단위 문자열을 파싱한다. 빈 문자열은 무차원. */
export function parseUnit(text: string): Unit {
  const cached = cache.get(text);
  if (cached) return cached;
  const trimmed = text.trim();
  let unit = DIMENSIONLESS;
  if (trimmed) {
    const [num = "", den, ...rest] = trimmed.split("/");
    if (rest.length > 0) throw new UnitError(`"/"는 한 번만 쓸 수 있다: "${text}"`);
    unit = parseProduct(num, text);
    if (den !== undefined) unit = multiply(unit, power(parseProduct(den, text), -1));
  }
  cache.set(text, unit);
  return unit;
}

export function sameDimension(a: Unit, b: Unit): boolean {
  return a.dimension.every((d, i) => d === b.dimension[i]);
}

/** `unit` 단위의 값을 SI 값으로. */
export function toSI(value: number, unit: string): number {
  return value * parseUnit(unit).scale;
}

/** SI 값을 `unit` 단위의 값으로. */
export function fromSI(value: number, unit: string): number {
  return value / parseUnit(unit).scale;
}

/** 단위 간 변환. 차원이 다르면 `UnitError`. */
export function convert(value: number, from: string, to: string): number {
  const a = parseUnit(from);
  const b = parseUnit(to);
  if (!sameDimension(a, b))
    throw new UnitError(`차원이 다른 단위는 변환할 수 없다: ${from} → ${to}`);
  return (value * a.scale) / b.scale;
}

const QUANTITY = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(.*?)\s*$/;

/** `"16 MHz"`, `"220Ω"`, `"3.3V"`를 파싱한다. 반환 값은 SI. */
export function parseQuantity(text: string): { value: number; unit: Unit } {
  const match = QUANTITY.exec(text);
  if (!match) throw new UnitError(`물리량 표기가 아니다: "${text}"`);
  const unit = parseUnit(match[2] ?? "");
  return { value: Number(match[1]) * unit.scale, unit };
}

const DISPLAY_PREFIXES: readonly [number, string][] = [
  [1e9, "G"],
  [1e6, "M"],
  [1e3, "k"],
  [1, ""],
  [1e-3, "m"],
  [1e-6, "µ"],
  [1e-9, "n"],
];

/** SI 값을 접두어 붙여 사람이 읽기 좋게 (0.0118, "A" → "11.8 mA"). 유효숫자 3자리. 단위가 없으면 접두어도 없다. */
export function formatQuantity(value: number, unit: string): string {
  if (!unit) return String(Number(value.toPrecision(3)));
  if (value === 0 || !Number.isFinite(value)) return `${value} ${unit}`;
  const [scale, prefix] = DISPLAY_PREFIXES.find(([s]) => Math.abs(value) >= s * 0.9995) ?? [
    1e-9,
    "n",
  ];
  return `${Number((value / scale).toPrecision(3))} ${prefix}${unit}`;
}
