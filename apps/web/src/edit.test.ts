import { describe, expect, it } from "vitest";
import {
  addInstance,
  connect,
  disconnect,
  formatJson,
  moveInstance,
  nextInstanceId,
  removeInstance,
  rotateInstance,
  setProgram,
  setProperty,
} from "./edit.ts";

const doc = {
  $schema: "../schemas/system.schema.json",
  name: "Blink",
  instances: [
    { id: "uno", model: "model.arduino-uno", program: "blink.js" },
    { id: "led1", model: "model.led", properties: { color: "red" } },
  ],
  connections: [
    ["uno:D13", "led1:A"],
    ["led1:C", "uno:GND.1"],
  ],
  layout: { instances: { uno: { x: 0, y: 0 } }, zoom: 2 },
};

describe("edit", () => {
  it("adds an instance with the next free ID and a position, keeping other fields", () => {
    const { doc: d, id } = addInstance(doc, "model.led", { x: 40, y: -100 });
    expect(id).toBe("led2");
    expect(d.instances).toContainEqual({ id: "led2", model: "model.led" });
    expect(d.layout).toEqual({
      instances: { uno: { x: 0, y: 0 }, led2: { x: 40, y: -100 } },
      zoom: 2,
    });
    expect(d.$schema).toBe(doc.$schema);
    expect(nextInstanceId(doc, "model.arduino-uno")).toBe("arduino-uno1");
  });

  it("moves and rotates in 90° steps", () => {
    expect(moveInstance(doc, "uno", 10, 20).layout).toMatchObject({
      instances: { uno: { x: 10, y: 20 } },
    });
    const r = rotateInstance(rotateInstance(doc, "led1", { x: 5, y: 5 }), "led1", { x: 0, y: 0 });
    expect(r.layout).toMatchObject({ instances: { led1: { x: 5, y: 5, rotate: 180 } } });
  });

  it("removes an instance with its connections and placement", () => {
    const d = removeInstance(doc, "led1");
    expect(d.instances).toEqual([doc.instances[0]]);
    expect(d.connections).toEqual([]);
    expect(removeInstance(doc, "uno").layout).toEqual({ instances: {}, zoom: 2 });
  });

  it("connects ports once, in either direction, and never to themselves", () => {
    expect(connect(doc, "uno:D12", "led1:A").connections).toHaveLength(3);
    expect(connect(doc, "led1:A", "uno:D13").connections).toHaveLength(2);
    expect(connect(doc, "uno:D1", "uno:D1").connections).toHaveLength(2);
    expect(disconnect(doc, 0).connections).toEqual([["led1:C", "uno:GND.1"]]);
  });

  it("sets and clears property overrides", () => {
    const d = setProperty(doc, "led1", "maxCurrent", "30mA");
    expect((d.instances as unknown[])[1]).toEqual({
      id: "led1",
      model: "model.led",
      properties: { color: "red", maxCurrent: "30mA" },
    });
    const cleared = setProperty(
      setProperty(doc, "led1", "color", undefined),
      "led1",
      "x",
      undefined,
    );
    expect((cleared.instances as unknown[])[1]).toEqual({ id: "led1", model: "model.led" });
  });
});

describe("setProgram", () => {
  it("attaches a program file to an instance", () => {
    const d = setProgram(doc, "led1", "led1.js");
    expect((d.instances as { program?: string }[])[1]?.program).toBe("led1.js");
  });
});

describe("formatJson", () => {
  it("inlines what fits in 100 columns and expands the rest, like Biome", () => {
    expect(formatJson(doc)).toBe(`{
  "$schema": "../schemas/system.schema.json",
  "name": "Blink",
  "instances": [
    { "id": "uno", "model": "model.arduino-uno", "program": "blink.js" },
    { "id": "led1", "model": "model.led", "properties": { "color": "red" } }
  ],
  "connections": [["uno:D13", "led1:A"], ["led1:C", "uno:GND.1"]],
  "layout": { "instances": { "uno": { "x": 0, "y": 0 } }, "zoom": 2 }
}
`);
  });

  it("round-trips", () => {
    expect(JSON.parse(formatJson(doc))).toEqual(doc);
  });
});
