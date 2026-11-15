import { describe, expect, it } from "vitest";
import { parseSystem, splitPortRef } from "./system.ts";

const blink = {
  name: "Blink",
  instances: [
    { id: "uno", model: "model.arduino-uno" },
    { id: "led1", model: "model.led", properties: { color: "green" } },
  ],
  connections: [
    ["uno:D13", "led1:A"],
    ["led1:C", "uno:GND.1"],
  ],
  layout: { led1: { x: 120, y: 40 }, wires: [] },
};

describe("parseSystem", () => {
  it("parses instances, pin-to-pin connections and keeps layout opaque", () => {
    const r = parseSystem(blink);
    expect(r.ok && r.value.connections).toEqual(blink.connections);
    expect(r.ok && r.value.layout).toEqual(blink.layout);
  });

  it("treats layout as optional", () => {
    const { layout: _, ...withoutLayout } = blink;
    expect(parseSystem(withoutLayout).ok).toBe(true);
  });

  it("rejects malformed port references", () => {
    const r = parseSystem({ ...blink, connections: [["uno.D13", "led1:A"]] });
    expect(!r.ok && r.issues[0]?.path).toBe("connections[0][0]");
  });

  it("rejects duplicate instance IDs", () => {
    const r = parseSystem({
      ...blink,
      instances: [...blink.instances, { id: "uno", model: "model.led" }],
    });
    expect(!r.ok && r.issues[0]?.path).toBe("instances[2].id");
  });
});

describe("splitPortRef", () => {
  it("splits at the first colon so port names may contain dots", () => {
    expect(splitPortRef("uno:GND.1")).toEqual({ instance: "uno", port: "GND.1" });
  });
});
