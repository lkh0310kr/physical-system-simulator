/**
 * 전체 화면 SVG 캔버스: 격자, 팬·줌, 부품과 배선, 직접 조작(이동·배선·선택).
 * 문서는 바꾸지 않는다. 사용자의 의도를 콜백으로 알리고, 바뀐 문서가 다시 props로 들어온다.
 */
import type { LoadedSystem } from "@physisim/core";
import { splitPortRef } from "@physisim/core";
import {
  type MutableRefObject,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent,
} from "react";
import {
  bounds,
  type PartSymbol,
  type Placement,
  pinDir,
  pinWorld,
  placements,
  route,
  snap,
  symbolFor,
} from "./geometry.ts";
import { Part } from "./part.tsx";

export interface Live {
  /** "instance.output" → 값. */
  readonly signals: Readonly<Record<string, unknown>>;
  /** 연결 인덱스 → 그 선에 전압이 걸렸는지. */
  readonly energized: ReadonlySet<number>;
}

export type Selection =
  | { readonly kind: "part"; readonly id: string }
  | { readonly kind: "wire"; readonly index: number };

interface Props {
  readonly loaded: LoadedSystem;
  readonly layout: unknown;
  readonly live?: Live | undefined;
  readonly selection?: Selection | undefined;
  readonly onSelect?: (s: Selection | undefined) => void;
  readonly onMove?: (id: string, x: number, y: number) => void;
  readonly onConnect?: (a: string, b: string) => void;
  /** 화면 가운데의 월드 좌표를 읽을 수 있게 채워 준다 (부품 추가 위치). */
  readonly centerRef?: MutableRefObject<() => { x: number; y: number }>;
}

interface View {
  readonly x: number;
  readonly y: number;
  readonly k: number;
}

export interface ScenePart {
  readonly id: string;
  readonly name: string;
  readonly symbol: PartSymbol;
  readonly placement: Placement;
}

export interface Scene {
  readonly parts: readonly ScenePart[];
  readonly wires: readonly { index: number; points: [number, number][] }[];
}

export function buildScene(
  loaded: LoadedSystem,
  layout: unknown,
  override?: { id: string; x: number; y: number },
): Scene {
  const items = loaded.system.instances.flatMap((inst) => {
    const model = loaded.registry.getModel(inst.model);
    return model ? [{ id: inst.id, name: model.name, symbol: symbolFor(model) }] : [];
  });
  const placed = placements(items, layout);
  const parts = items.map((i) => {
    const p = placed.get(i.id) ?? { x: 0, y: 0, rotate: 0 };
    return { ...i, placement: override?.id === i.id ? { ...p, x: override.x, y: override.y } : p };
  });
  const byId = new Map(parts.map((p) => [p.id, p]));
  const at = (ref: string) => {
    const { instance, port } = splitPortRef(ref);
    const p = byId.get(instance);
    const pos = p && pinWorld(p.symbol, p.placement, port);
    return p && pos ? { pos, dir: pinDir(p.symbol, p.placement, port) } : undefined;
  };
  const wires = loaded.doc.connections.flatMap(([a, b], index) => {
    const pa = at(a);
    const pb = at(b);
    return pa && pb ? [{ index, points: route(pa.pos, pb.pos, pa.dir, pb.dir) }] : [];
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

type Drag =
  | { kind: "pan"; sx: number; sy: number; view: View }
  | { kind: "part"; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean }
  | { kind: "wire"; from: string; start: [number, number] };

export function Canvas({
  loaded,
  layout,
  live,
  selection,
  onSelect,
  onMove,
  onConnect,
  centerRef,
}: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View | undefined>(undefined);
  const drag = useRef<Drag | undefined>(undefined);
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | undefined>(
    undefined,
  );
  const [pending, setPending] = useState<
    { start: [number, number]; end: [number, number] } | undefined
  >(undefined);
  const scene = useMemo(() => buildScene(loaded, layout, dragPos), [loaded, layout, dragPos]);

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
  const toWorld = (clientX: number, clientY: number): [number, number] => {
    const r = svg.current?.getBoundingClientRect();
    return [(clientX - (r?.left ?? 0) - v.x) / v.k, (clientY - (r?.top ?? 0) - v.y) / v.k];
  };
  if (centerRef) {
    centerRef.current = () => {
      const r = svg.current?.getBoundingClientRect();
      const [x, y] = toWorld(
        (r?.left ?? 0) + (r?.width ?? 0) / 2,
        (r?.top ?? 0) + (r?.height ?? 0) / 2,
      );
      return { x: snap(x), y: snap(y) };
    };
  }

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
    const target = e.target as Element;
    const pin = target.getAttribute("data-pin");
    const partEl = target.closest(".part");
    const wireIndex = target.getAttribute("data-wire");
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pin) {
      const { instance, port } = splitPortRef(pin);
      const p = scene.parts.find((x) => x.id === instance);
      const start = p && pinWorld(p.symbol, p.placement, port);
      if (start) {
        drag.current = { kind: "wire", from: pin, start };
        setPending({ start, end: start });
      }
    } else if (partEl) {
      const id = partEl.getAttribute("data-id") ?? "";
      const p = scene.parts.find((x) => x.id === id);
      if (p)
        drag.current = {
          kind: "part",
          id,
          sx: e.clientX,
          sy: e.clientY,
          ox: p.placement.x,
          oy: p.placement.y,
          moved: false,
        };
      onSelect?.({ kind: "part", id });
    } else if (wireIndex !== null) {
      onSelect?.({ kind: "wire", index: Number(wireIndex) });
    } else {
      drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, view: v };
      onSelect?.(undefined);
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "pan")
      setView({ ...d.view, x: d.view.x + e.clientX - d.sx, y: d.view.y + e.clientY - d.sy });
    else if (d.kind === "part") {
      const dx = (e.clientX - d.sx) / v.k;
      const dy = (e.clientY - d.sy) / v.k;
      if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
      if (d.moved) setDragPos({ id: d.id, x: snap(d.ox + dx), y: snap(d.oy + dy) });
    } else setPending({ start: d.start, end: toWorld(e.clientX, e.clientY) });
  };

  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = undefined;
    if (d?.kind === "part" && d.moved && dragPos) onMove?.(d.id, dragPos.x, dragPos.y);
    if (d?.kind === "wire") {
      // 포인터 캡처 중이므로 놓은 위치의 요소를 직접 찾는다.
      const to = document.elementFromPoint(e.clientX, e.clientY)?.getAttribute("data-pin");
      if (to && to !== d.from) onConnect?.(d.from, to);
      setPending(undefined);
    }
    // 저장된 문서가 돌아와 반영될 때까지 드래그 위치를 잠깐 유지해 깜빡임을 막는다.
    setTimeout(() => setDragPos(undefined), 0);
  };

  const activity = (id: string) => {
    const b = live?.signals[`${id}.brightness`];
    return typeof b === "number" ? b : 0;
  };
  const pts = (p: [number, number][]) => p.map((x) => x.join(",")).join(" ");

  return (
    <svg
      ref={svg}
      className={`canvas${pending ? " wiring" : ""}`}
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
        {scene.wires.map((w) => {
          const selected = selection?.kind === "wire" && selection.index === w.index;
          return (
            <g key={w.index}>
              <polyline
                points={pts(w.points)}
                className={`wire${live?.energized.has(w.index) ? " live" : ""}${selected ? " selected" : ""}`}
              />
              <polyline points={pts(w.points)} className="wire-hit" data-wire={w.index} />
            </g>
          );
        })}
        {scene.parts.map((p) => (
          <Part
            key={p.id}
            {...p}
            activity={activity(p.id)}
            selected={selection?.kind === "part" && selection.id === p.id}
          />
        ))}
        {pending && (
          <polyline points={pts(route(pending.start, pending.end))} className="wire pending" />
        )}
      </g>
    </svg>
  );
}
