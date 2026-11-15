import type { PropertyDefinition } from "@physisim/core";
import { describe, expect, it } from "vitest";
import { checkValue, displayValue, parseInput } from "./inspector.ts";

const resistance: PropertyDefinition = { type: "number", unit: "Ω", min: 0 };
const color: PropertyDefinition = { type: "enum", options: ["red", "green"] };

describe("inspector", () => {
  it("keeps plain numbers as numbers and quantities as strings", () => {
    expect(parseInput(resistance, " 220 ")).toBe(220);
    expect(parseInput(resistance, "4.7kΩ")).toBe("4.7kΩ");
    expect(parseInput({ type: "boolean" }, "true")).toBe(true);
  });

  it("validates a single value against its definition", () => {
    expect(checkValue(resistance, "4.7kΩ")).toBeUndefined();
    expect(checkValue(resistance, "5V")).toContain("단위");
    expect(checkValue(resistance, -1)).toContain("최솟값");
    expect(checkValue(color, "pink")).toContain("red");
  });

  it("shows numbers with their unit", () => {
    expect(displayValue(resistance, 220)).toBe("220 Ω");
    expect(displayValue(resistance, "4.7kΩ")).toBe("4.7kΩ");
    expect(displayValue(color, undefined)).toBe("");
  });
});
