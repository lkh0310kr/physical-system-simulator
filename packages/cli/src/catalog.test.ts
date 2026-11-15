import { createStandardRegistry } from "@physisim/models";
import { describe, expect, it } from "vitest";
import { describeModel, searchModels } from "./catalog.ts";

const registry = createStandardRegistry();

describe("searchModels", () => {
  it("matches ID, name or category case-insensitively", () => {
    expect(searchModels(registry, "LED").map((m) => m.id)).toEqual(["model.led"]);
    expect(searchModels(registry, "electronics/board").map((m) => m.id)).toEqual([
      "model.arduino-uno",
    ]);
    expect(searchModels(registry).length).toBe(registry.models().length);
  });
});

describe("describeModel", () => {
  it("summarizes ports, property values with units and capabilities", () => {
    const led = registry.getModel("model.led");
    if (!led) throw new Error("fixture");
    expect(describeModel(registry, led)).toBe(
      [
        "model.led  LED  [electronics/output]",
        "  5mm 단색 LED",
        "  ports       A, C",
        "  properties  forwardVoltage=2 V, maxCurrent=20 mA, color=red, dynamicResistance=10 Ω",
        "  capability  capability.light-emission → behavior.led",
      ].join("\n"),
    );
  });

  it("marks ground ports and shows binding config", () => {
    const uno = registry.getModel("model.arduino-uno");
    if (!uno) throw new Error("fixture");
    const text = describeModel(registry, uno);
    expect(text).toContain("GND.1(GND)");
    expect(text).toContain("capability.gpio (pinCount=20, logicLevel=5) → behavior.digital-io");
  });
});
