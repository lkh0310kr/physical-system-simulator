/**
 * 캔버스 기하: Model → 부품 심볼(라인아트), 배치, 핀의 월드 좌표, 배선 경로. 순수 함수.
 * 단위는 캔버스 px, 격자 10px. 그래픽은 Model의 Port와 Capability에서 자동으로 만든다 (부품별 하드코딩 없음).
 */
import type { Model } from "@physisim/core";

export const GRID = 10;
export const PIN_PITCH = 20;

export type Glyph = "led" | "resistor" | "box";

export interface PinGeom {
  readonly name: string;
  /** 부품 원점(좌상단) 기준. */
  readonly x: number;
  readonly y: number;
  readonly ground: boolean;
}

export interface PartSymbol {
  readonly kind: "two-terminal" | "board";
  readonly glyph: Glyph;
  readonly width: number;
  readonly height: number;
  readonly pins: readonly PinGeom[];
}

export interface Placement {
  readonly x: number;
  readonly y: number;
  /** 0 | 90 | 180 | 270 (시계 방향) */
  readonly rotate: number;
}

const glyphOf = (m: Model): Glyph => {
  const caps = m.capabilities.map((c) => c.capability);
  if (caps.includes("capability.light-emission")) return "led";
  if (caps.includes("capability.resistance")) return "resistor";
  return "box";
};

export function symbolFor(m: Model): PartSymbol {
  if (m.ports.length <= 2) {
    const width = 80;
    const height = 40;
    const pins = m.ports.map((p, i) => ({
      name: p.name,
      x: i === 0 ? 0 : width,
      y: height / 2,
      ground: !!p.ground,
    }));
    return { kind: "two-terminal", glyph: glyphOf(m), width, height, pins };
  }
  // 핀이 많은 부품: 위쪽 가장자리에 선언 순서대로 한 줄 (헤더처럼).
  const margin = 30;
  const width = margin * 2 + (m.ports.length - 1) * PIN_PITCH;
  const height = 120;
  const pins = m.ports.map((p, i) => ({
    name: p.name,
    x: margin + i * PIN_PITCH,
    y: 0,
    ground: !!p.ground,
  }));
  return { kind: "board", glyph: "box", width, height, pins };
}

/** 부품 중심 기준으로 회전한 점. */
export function rotatePoint(x: number, y: number, s: PartSymbol, rotate: number): [number, number] {
  const cx = s.width / 2;
  const cy = s.height / 2;
  const dx = x - cx;
  const dy = y - cy;
  switch (((rotate % 360) + 360) % 360) {
    case 90:
      return [cx - dy, cy + dx];
    case 180:
      return [cx - dx, cy - dy];
    case 270:
      return [cx + dy, cy - dx];
    default:
      return [x, y];
  }
}

export function pinWorld(s: PartSymbol, p: Placement, pin: string): [number, number] | undefined {
  const g = s.pins.find((x) => x.name === pin);
  if (!g) return undefined;
  const [x, y] = rotatePoint(g.x, g.y, s, p.rotate);
  return [p.x + x, p.y + y];
}

export const snap = (v: number) => Math.round(v / GRID) * GRID;

/**
 * 문서 layout의 배치. 없으면 자동 배치: 보드는 위 줄, 나머지는 아래 줄에 왼쪽부터.
 * layout 형식: `{ "instances": { "<id>": { "x", "y", "rotate" } } }`
 */
export function placements(
  instances: readonly { id: string; symbol: PartSymbol }[],
  layout: unknown,
): Map<string, Placement> {
  const saved =
    (layout as { instances?: Record<string, Partial<Placement>> } | undefined)?.instances ?? {};
  const out = new Map<string, Placement>();
  let boardX = 0;
  let partX = 0;
  for (const { id, symbol } of instances) {
    const s = saved[id];
    if (s && typeof s.x === "number" && typeof s.y === "number") {
      out.set(id, { x: s.x, y: s.y, rotate: typeof s.rotate === "number" ? s.rotate : 0 });
    } else if (symbol.kind === "board") {
      out.set(id, { x: boardX, y: 0, rotate: 0 });
      boardX += symbol.width + 60;
    } else {
      out.set(id, { x: partX, y: -160, rotate: 0 });
      partX += symbol.width + 60;
    }
  }
  return out;
}

/** 두 핀을 잇는 직각 경로: 가로로 가다가 세로로 꺾는다. */
export function route(a: [number, number], b: [number, number]): [number, number][] {
  if (a[0] === b[0] || a[1] === b[1]) return [a, b];
  return [a, [b[0], a[1]], b];
}

/** 점들의 경계 상자 [minX, minY, maxX, maxY]. */
export function bounds(
  points: readonly [number, number][],
): [number, number, number, number] | undefined {
  if (points.length === 0) return undefined;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
