/** 전체 화면 SVG 캔버스: 격자, 팬·줌, 부품과 배선. 시스템 상태는 props로만 받는다. */
import type { LoadedSystem } from "@physisim/core";
import { splitPortRef } from "@physisim/core";
import { type PointerEvent, useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import {
  bounds,
  type PartSymbol,
  type Placement,
  pinWorld,
  placements,
  route,
  symbolFor,
} from "./geometry.ts";
import { Part } from "./Part.tsx";

export interface Live {
  /** "instance.output" → 값. */
  readonly signals: Readonly<Record<string, unknown>>;
  /** 연결 인덱스 → 그 선에 전압이 걸렸는지. */
  readonly energized: ReadonlySet<number>;
}

interface Props {
  readonly loaded: LoadedSystem;
  readonly layout: unknown;
  readonly live?: Live | undefined;
  readonly selected?: string | undefined;
}

interface View {
  readonly x: number;
  readonly y: number;
  readonly k: number;
}

export interface Scene {
  readonly parts: readonly { id: string; name: string; symbol: PartSymbol; placement: Placement }[];
  readonly wires: readonly { index: number; points: [number, number][] }[];
}

export function buildScene(loaded: LoadedSystem, layout: unknown): Scene {
  const items = loaded.system.instances.flatMap((inst) => {
    const model = loaded.registry.getModel(inst.model);
    return model ? [{ id: inst.id, name: model.name, symbol: symbolFor(model) }] : [];
  });
  const placed = placements(items, layout);
  const parts = items.map((i) => ({
    ...i,
    placement: placed.get(i.id) ?? { x: 0, y: 0, rotate: 0 },
  }));
  const byId = new Map(parts.map((p) => [p.id, p]));
  const at = (ref: string) => {
    const { instance, port } = splitPortRef(ref);
    const p = byId.get(instance);
    return p && pinWorld(p.symbol, p.placement, port);
  };
  const wires = loaded.doc.connections.flatMap(([a, b], index) => {
    const pa = at(a);
    const pb = at(b);
    return pa && pb ? [{ index, points: route(pa, pb) }] : [];
  });
  return { parts, wires };
}

function fit(scene: Scene, width: number, height: number): View {
  const pts = scene.parts.flatMap((p) => [
    [p.placement.x, p.placement.y] as [number, number],
    [p.placement.x + p.symbol.width, p.placement.y + p.symbol.height] as [number, number],
  ]);
  const b = bounds(pts);
  if (!b) return { x: width / 2, y: height / 2, k: 1 };
  const pad = 120;
  const k = Math.min(
    2,
    Math.max(0.2, Math.min(width / (b[2] - b[0] + pad * 2), height / (b[3] - b[1] + pad * 2))),
  );
  return { x: width / 2 - ((b[0] + b[2]) / 2) * k, y: height / 2 - ((b[1] + b[3]) / 2) * k, k };
}

export function Canvas({ loaded, layout, live, selected }: Props) {
  const scene = useMemo(() => buildScene(loaded, layout), [loaded, layout]);
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View | undefined>(undefined);
  const drag = useRef<{ x: number; y: number; view: View } | undefined>(undefined);

  // 처음 열거나 다른 System으로 바뀌면 화면에 맞춘다. 같은 문서를 편집할 때는 시점을 유지한다.
  const fitted = useRef<string | undefined>(undefined);
  const name = loaded.doc.name;
  useEffect(() => {
    const el = svg.current;
    if (!el || fitted.current === name) return;
    fitted.current = name;
    setView(fit(scene, el.clientWidth, el.clientHeight));
  }, [name, scene]);

  const v = view ?? { x: 0, y: 0, k: 1 };

  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const rect = e.currentTarget.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const k = Math.min(4, Math.max(0.15, v.k * Math.exp(-e.deltaY * 0.01)));
      setView({ k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k });
    } else {
      setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
    }
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.target !== e.currentTarget && !(e.target as Element).classList.contains("grid")) return;
    drag.current = { x: e.clientX, y: e.clientY, view: v };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (d) setView({ ...d.view, x: d.view.x + e.clientX - d.x, y: d.view.y + e.clientY - d.y });
  };
  const onPointerUp = () => {
    drag.current = undefined;
  };

  const activity = (id: string) => {
    const b = live?.signals[`${id}.brightness`];
    return typeof b === "number" ? b : 0;
  };

  return (
    <svg
      ref={svg}
      className="canvas"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <title>{loaded.doc.name}</title>
      <defs>
        <pattern
          id="grid-minor"
          width={10}
          height={10}
          patternUnits="userSpaceOnUse"
          patternTransform={`translate(${v.x} ${v.y}) scale(${v.k})`}
        >
          <path d="M10 0H0V10" className="grid-line" />
        </pattern>
        <pattern
          id="grid-major"
          width={50}
          height={50}
          patternUnits="userSpaceOnUse"
          patternTransform={`translate(${v.x} ${v.y}) scale(${v.k})`}
        >
          <path d="M50 0H0V50" className="grid-line major" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid-minor)" className="grid" />
      <rect width="100%" height="100%" fill="url(#grid-major)" className="grid" />
      <g transform={`translate(${v.x} ${v.y}) scale(${v.k})`}>
        {scene.wires.map((w) => (
          <polyline
            key={w.index}
            points={w.points.map((p) => p.join(",")).join(" ")}
            className={`wire${live?.energized.has(w.index) ? " live" : ""}`}
          />
        ))}
        {scene.parts.map((p) => (
          <Part key={p.id} {...p} activity={activity(p.id)} selected={p.id === selected} />
        ))}
      </g>
    </svg>
  );
}
