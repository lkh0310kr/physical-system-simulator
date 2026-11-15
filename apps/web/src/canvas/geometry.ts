/**
 * 캔버스 기하: Model → 부품 심볼(라인아트), 배치, 핀의 월드 좌표, 배선 경로. 순수 함수.
 * 단위는 캔버스 px, 격자 10px. 그래픽은 Model의 Port와 Capability에서 자동으로 만든다 (부품별 하드코딩 없음).
 */
import type { Model } from "@physisim/core";

export const GRID = 10;
export const PIN_PITCH = 20;

export type Glyph = "led" | "resistor" | "switch" | "box";

export type Vec = readonly [number, number];

export interface PinGeom {
  readonly name: string;
  /** 부품 원점(좌상단) 기준. */
  readonly x: number;
  readonly y: number;
  /** 선이 핀에서 빠져나가는 방향 (단위 벡터). */
  readonly dir: Vec;
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
  if (caps.includes("capability.switching")) return "switch";
  return "box";
};

export function symbolFor(m: Model): PartSymbol {
  if (m.ports.length >= 1 && m.ports.length <= 2) {
    const width = 80;
    const height = 40;
    const pins = m.ports.map((p, i) => ({
      name: p.name,
      x: i === 0 ? 0 : width,
      y: height / 2,
      dir: (i === 0 ? [-1, 0] : [1, 0]) as Vec,
      ground: !!p.ground,
    }));
    return { kind: "two-terminal", glyph: glyphOf(m), width, height, pins };
  }
  // 핀이 많은 부품: 위쪽 가장자리에 선언 순서대로 한 줄 (헤더처럼).
  const margin = 30;
  // 핀이 없는 부품(벽·바닥 같은 환경)은 이름만 있는 작은 상자
  const width = Math.max(120, margin * 2 + (m.ports.length - 1) * PIN_PITCH);
  const height = m.ports.length === 0 ? 60 : 120;
  const pins = m.ports.map((p, i) => ({
    name: p.name,
    x: margin + i * PIN_PITCH,
    y: 0,
    dir: [0, -1] as Vec,
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

/** 회전을 반영한 핀의 바깥 방향. */
export function pinDir(s: PartSymbol, p: Placement, pin: string): Vec {
  const d = s.pins.find((x) => x.name === pin)?.dir ?? [0, 0];
  switch (((p.rotate % 360) + 360) % 360) {
    case 90:
      return [-d[1], d[0]];
    case 180:
      return [-d[0], -d[1]];
    case 270:
      return [d[1], -d[0]];
    default:
      return d;
  }
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

const STUB = 20;

/**
 * 두 핀을 잇는 직각 경로. 후보(바로 꺾기 / 핀 바깥으로 STUB만큼 빠져나온 뒤 꺾기, 각각 세로·가로 먼저) 중
 * 되돌아가지 않고, 핀의 바깥 방향으로 나가고 들어오며, 가장 짧은 것을 고른다
 * — 보드 헤더를 따라 겹치거나 부품 몸체를 가로지르는 선을 피한다.
 */
export function route(
  a: [number, number],
  b: [number, number],
  da: Vec = [0, 0],
  db: Vec = [0, 0],
): [number, number][] {
  const sa: [number, number] = [a[0] + da[0] * STUB, a[1] + da[1] * STUB];
  const sb: [number, number] = [b[0] + db[0] * STUB, b[1] + db[1] * STUB];
  const candidates = [
    simplify([a, [b[0], a[1]], b]),
    simplify([a, [a[0], b[1]], b]),
    simplify([a, sa, [sb[0], sa[1]], sb, b]),
    simplify([a, sa, [sa[0], sb[1]], sb, b]),
  ];
  const dirOf = (p: [number, number], q: [number, number]) => [
    Math.sign(q[0] - p[0]),
    Math.sign(q[1] - p[1]),
  ];
  /**
   * 핀 방향 감점: 첫 구간은 핀의 바깥 방향(da)으로, 마지막 구간은 바깥에서(-db) 들어와야 한다.
   * 정반대면 부품 몸체를 관통하므로 크게, 옆으로 비껴 나가면 조금 감점한다.
   */
  const penalty = (seg: number[], want: Vec) => {
    if (!want[0] && !want[1]) return 0;
    const dot = (seg[0] ?? 0) * want[0] + (seg[1] ?? 0) * want[1];
    return dot < 0 ? 1e5 : dot === 0 ? 30 : 0;
  };
  const violations = (pts: [number, number][]) =>
    penalty(dirOf(pts[0] ?? a, pts[1] ?? b), da) +
    penalty(dirOf(pts[pts.length - 2] ?? a, pts[pts.length - 1] ?? b), [-db[0], -db[1]]);
  const score = (pts: [number, number][]) => {
    let length = 0;
    let reversals = 0;
    for (let i = 1; i < pts.length; i++) {
      const [p, q, r] = [pts[i - 1], pts[i], pts[i + 1]] as [
        [number, number],
        [number, number],
        [number, number] | undefined,
      ];
      length += Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]);
      if (r && Math.sign(q[0] - p[0]) * Math.sign(r[0] - q[0]) < 0) reversals++;
      if (r && Math.sign(q[1] - p[1]) * Math.sign(r[1] - q[1]) < 0) reversals++;
    }
    return reversals * 1e6 + violations(pts) + length;
  };
  return candidates.reduce((best, c) => (score(c) < score(best) ? c : best));
}

/** 연속된 같은 점과, 같은 방향으로 이어지는 일직선의 중간점을 뺀다 (되돌아가는 점은 남긴다). */
function simplify(points: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last[0] === p[0] && last[1] === p[1]) continue;
    const prev = out[out.length - 2];
    const continues =
      prev &&
      last &&
      Math.sign(last[0] - prev[0]) === Math.sign(p[0] - last[0]) &&
      Math.sign(last[1] - prev[1]) === Math.sign(p[1] - last[1]);
    if (continues) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
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
