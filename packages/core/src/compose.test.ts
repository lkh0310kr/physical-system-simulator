import { describe, expect, it } from "vitest";
import { buildSystem } from "./compose.ts";
import { loadLibrary } from "./loader.ts";
import { type SystemDocInput, SystemSchema } from "./system.ts";

const e = (name: string) => ({ name, domain: "electrical" });
const lib = loadLibrary({
  models: [
    { id: "model.board", name: "Board", category: "x", ports: [e("D13"), e("GND.1"), e("GND.2")] },
    { id: "model.resistor", name: "R", category: "x", ports: [e("1"), e("2")] },
    { id: "model.led", name: "LED", category: "x", ports: [e("A"), e("C")] },
    {
      id: "model.wheel",
      name: "Wheel",
      category: "x",
      ports: [{ name: "axle", domain: "mechanical" }],
    },
  ],
});
if (!lib.ok) throw new Error("fixture");
const registry = lib.value;

const build = (doc: Partial<SystemDocInput>) =>
  buildSystem(
    registry,
    SystemSchema.parse({
      name: "test",
      instances: [
        { id: "uno", model: "model.board" },
        { id: "r1", model: "model.resistor" },
        { id: "led1", model: "model.led" },
        { id: "w", model: "model.wheel" },
      ],
      ...doc,
    }),
  );

describe("buildSystem", () => {
  it("turns each separate chain of connections into its own net", () => {
    const r = build({
      connections: [
        ["uno:D13", "r1:1"],
        ["r1:2", "led1:A"],
        ["led1:C", "uno:GND.1"],
      ],
    });
    expect(r.ok && r.value.nets).toEqual([
      { id: "n1", domain: "electrical", ports: ["uno:D13", "r1:1"] },
      { id: "n2", domain: "electrical", ports: ["r1:2", "led1:A"] },
      { id: "n3", domain: "electrical", ports: ["led1:C", "uno:GND.1"] },
    ]);
  });

  it("merges connections that share a port into one net", () => {
    const r = build({
      connections: [
        ["led1:C", "uno:GND.1"],
        ["r1:2", "uno:GND.2"],
        ["uno:GND.2", "led1:C"],
      ],
    });
    expect(r.ok && r.value.nets.map((n) => n.ports)).toEqual([
      ["led1:C", "uno:GND.1", "r1:2", "uno:GND.2"],
    ]);
  });

  it("creates every instance and leaves unconnected ports without a net", () => {
    const r = build({ connections: [] });
    expect(r.ok && r.value.instances.map((i) => i.id)).toEqual(["uno", "r1", "led1", "w"]);
    expect(r.ok && r.value.nets).toEqual([]);
  });

  it("reports unknown instances and ports with their position", () => {
    const r = build({ connections: [["ghost:1", "uno:D99"]] });
    expect(!r.ok && r.issues.map((i) => i.path)).toEqual([
      "connections[0][0]",
      "connections[0][1]",
    ]);
  });

  it("refuses to connect ports of different domains", () => {
    const r = build({ connections: [["w:axle", "uno:D13"]] });
    expect(!r.ok && r.issues[0]?.message).toContain("도메인이 다른 Port");
  });

  it("refuses to connect a port to itself", () => {
    expect(build({ connections: [["uno:D13", "uno:D13"]] }).ok).toBe(false);
  });

  it("reports instance creation problems at the instance position", () => {
    const r = build({ instances: [{ id: "x", model: "model.missing" }] });
    expect(!r.ok && r.issues[0]?.path).toBe("instances[0].model");
  });
});
