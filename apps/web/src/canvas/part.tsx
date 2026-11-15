/** 부품 라인아트. 2톤(흰색·그래파이트) + 얇은 외곽선, 살아 있을 때만 강조색 (docs/DESIGN.md). */
import type { PartSymbol, Placement } from "./geometry.ts";

interface Props {
  readonly id: string;
  readonly name: string;
  readonly symbol: PartSymbol;
  readonly placement: Placement;
  /** 0~1. 빛·동작 등 "살아 있음"의 세기. */
  readonly activity?: number;
  /** 스위치가 닫혀 있는지. */
  readonly closed?: boolean;
  readonly selected?: boolean;
}

function TwoTerminal({
  symbol,
  activity = 0,
  closed = false,
}: {
  symbol: PartSymbol;
  activity?: number;
  closed?: boolean;
}) {
  const mid = symbol.height / 2;
  const cx = symbol.width / 2;
  return (
    <>
      <line x1={0} y1={mid} x2={cx - 16} y2={mid} className="lead" />
      <line x1={cx + 16} y1={mid} x2={symbol.width} y2={mid} className="lead" />
      {symbol.glyph === "led" ? (
        <g>
          {activity > 0.01 && (
            <circle cx={cx} cy={mid} r={22} className="glow" style={{ opacity: activity }} />
          )}
          <circle cx={cx} cy={mid} r={14} className="body" />
          <circle cx={cx} cy={mid} r={14} className="lit" style={{ opacity: activity }} />
          <path
            d={`M${cx - 5} ${mid - 6} L${cx + 5} ${mid} L${cx - 5} ${mid + 6} Z M${cx + 5} ${mid - 6} V${mid + 6}`}
            className="mark"
          />
        </g>
      ) : symbol.glyph === "switch" ? (
        <g className={`switch${closed ? " closed" : ""}`}>
          <circle cx={cx - 14} cy={mid} r={2.5} className="contact" />
          <circle cx={cx + 14} cy={mid} r={2.5} className="contact" />
          {/* 닫히면 접점에 닿고, 열리면 위로 들린다 */}
          <line x1={cx - 14} y1={mid} x2={cx + 14} y2={closed ? mid : mid - 11} className="blade" />
          <rect x={cx - 18} y={mid - 16} width={36} height={32} className="hit" />
        </g>
      ) : symbol.glyph === "resistor" ? (
        <rect x={cx - 16} y={mid - 6} width={32} height={12} rx={3} className="body" />
      ) : (
        <rect x={cx - 16} y={mid - 10} width={32} height={20} rx={4} className="body" />
      )}
    </>
  );
}

/** 보드 폭에 들어가게 이름을 줄인다 (글자당 약 7px). 전체 이름은 툴팁으로 남긴다. */
export function fitLabel(name: string, width: number): string {
  const max = Math.max(4, Math.floor((width - 16) / 7));
  return name.length <= max ? name : `${name.slice(0, max - 1)}…`;
}

function Board({ symbol, name }: { symbol: PartSymbol; name: string }) {
  return (
    <>
      <rect width={symbol.width} height={symbol.height} rx={10} className="board" />
      {symbol.pins.map((p) => (
        <text key={p.name} x={p.x} y={14} className="pin-label" transform={`rotate(90 ${p.x} 14)`}>
          {p.name}
        </text>
      ))}
      <text x={symbol.width / 2} y={symbol.height - 18} className="board-name">
        <title>{name}</title>
        {fitLabel(name, symbol.width)}
      </text>
    </>
  );
}

export function Part({ id, name, symbol, placement, activity, closed, selected }: Props) {
  const { width: w, height: h } = symbol;
  const vertical = placement.rotate % 180 !== 0;
  // 이름표는 회전하지 않는다: 보드는 왼쪽 아래, 세로 부품은 오른쪽, 가로 부품은 위.
  const label =
    symbol.kind === "board"
      ? { x: 0, y: h + 18, anchor: "start" as const }
      : vertical
        ? { x: w / 2 + 16, y: h / 2 + 4, anchor: "start" as const }
        : { x: w / 2, y: -6, anchor: "middle" as const };
  return (
    <g
      className={`part${selected ? " selected" : ""}`}
      data-id={id}
      transform={`translate(${placement.x} ${placement.y})`}
    >
      <g transform={`rotate(${placement.rotate} ${w / 2} ${h / 2})`}>
        {symbol.kind === "board" ? (
          <Board symbol={symbol} name={name} />
        ) : (
          <TwoTerminal symbol={symbol} activity={activity ?? 0} closed={closed ?? false} />
        )}
        {selected && (
          <rect x={-8} y={-8} width={w + 16} height={h + 16} rx={12} className="selection" />
        )}
        {symbol.pins.map((p) => (
          <circle
            key={p.name}
            cx={p.x}
            cy={p.y}
            r={3.5}
            className="pin"
            data-pin={`${id}:${p.name}`}
          />
        ))}
      </g>
      <text x={label.x} y={label.y} className="part-id" textAnchor={label.anchor}>
        {id}
      </text>
    </g>
  );
}
