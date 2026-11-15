import { ModelSchema } from "@physisim/core";
import { createStandardRegistry } from "@physisim/models";
import { describe, expect, it } from "vitest";
import { pinWorld, placements, route, symbolFor } from "./geometry.ts";

const registry = createStandardRegistry();
const model = (id: string) => {
  const m = registry.getModel(id);
  if (!m) throw new Error(id);
  return m;
};

describe("symbolFor", () => {
  it("draws two-port parts inline with a glyph chosen by capability", () => {
    expect(symbolFor(model("model.led"))).toMatchObject({ kind: "two-terminal", glyph: "led" });
    expect(symbolFor(model("model.resistor")).glyph).toBe("resistor");
    expect(symbolFor(model("model.led")).pins.map((p) => [p.name, p.x, p.y])).toEqual([
      ["A", 0, 20],
      ["C", 80, 20],
    ]);
  });

  it("draws many-port parts as a board with a pin header along the top", () => {
    const s = symbolFor(model("model.arduino-uno"));
    expect(s.kind).toBe("board");
    expect(s.pins).toHaveLength(26);
    expect(new Set(s.pins.map((p) => p.y))).toEqual(new Set([0]));
    expect(s.pins.find((p) => p.name === "GND.1")?.ground).toBe(true);
  });

  it("falls back to a plain box for unknown two-port parts", () => {
    const m = ModelSchema.parse({
      id: "model.x",
      name: "X",
      category: "x",
      ports: [{ name: "1", domain: "electrical" }],
    });
    expect(symbolFor(m).glyph).toBe("box");
  });
});

describe("pinWorld", () => {
  const led = symbolFor(model("model.led"));
  it("offsets pins by placement and rotates around the part center", () => {
    expect(pinWorld(led, { x: 100, y: 50, rotate: 0 }, "A")).toEqual([100, 70]);
    expect(pinWorld(led, { x: 100, y: 50, rotate: 90 }, "A")).toEqual([140, 30]);
    expect(pinWorld(led, { x: 100, y: 50, rotate: 180 }, "A")).toEqual([180, 70]);
    expect(pinWorld(led, { x: 0, y: 0, rotate: 0 }, "Z")).toBeUndefined();
  });
});

describe("placements", () => {
  const items = [
    { id: "uno", symbol: symbolFor(model("model.arduino-uno")) },
    { id: "r1", symbol: symbolFor(model("model.resistor")) },
    { id: "led1", symbol: symbolFor(model("model.led")) },
  ];

  it("uses saved layout positions", () => {
    const p = placements(items, { instances: { r1: { x: 260, y: -40, rotate: 90 } } });
    expect(p.get("r1")).toEqual({ x: 260, y: -40, rotate: 90 });
  });

  it("auto-places parts without a saved position: boards on one row, parts above", () => {
    const p = placements(items, undefined);
    expect(p.get("uno")).toEqual({ x: 0, y: 0, rotate: 0 });
    expect(p.get("r1")).toEqual({ x: 0, y: -160, rotate: 0 });
    expect(p.get("led1")).toEqual({ x: 140, y: -160, rotate: 0 });
  });
});

describe("route", () => {
  it("connects pins with one horizontal then one vertical segment", () => {
    expect(route([0, 0], [50, 30])).toEqual([
      [0, 0],
      [50, 0],
      [50, 30],
    ]);
    expect(route([0, 0], [0, 30])).toEqual([
      [0, 0],
      [0, 30],
    ]);
  });
});
