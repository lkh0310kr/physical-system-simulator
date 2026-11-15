import { describe, expect, it } from "vitest";
import { PropertyDefinitionSchema, type PropertySchema, resolveProperties } from "./property.ts";

const led: PropertySchema = {
  forwardVoltage: { type: "number", unit: "V", min: 0, max: 10 },
  maxCurrent: { type: "number", unit: "mA", default: 20 },
  color: { type: "enum", options: ["red", "green", "blue"], default: "red" },
  pins: { type: "integer", min: 1 },
};

describe("resolveProperties", () => {
  it("normalizes numbers given in the schema unit to SI", () => {
    const r = resolveProperties(led, { forwardVoltage: 2, pins: 2 });
    expect(r).toEqual({
      ok: true,
      value: { forwardVoltage: 2, maxCurrent: 0.02, color: "red", pins: 2 },
    });
  });

  it("accepts quantity strings in any unit of the same dimension", () => {
    const r = resolveProperties(led, { forwardVoltage: "2100mV", maxCurrent: "0.03A", pins: 2 });
    expect(r.ok && r.value.forwardVoltage).toBeCloseTo(2.1);
    expect(r.ok && r.value.maxCurrent).toBeCloseTo(0.03);
  });

  it("rejects a quantity whose dimension does not match", () => {
    const r = resolveProperties(led, { forwardVoltage: "2A", pins: 2 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.issues[0]?.path).toBe("forwardVoltage");
  });

  it("checks min/max in the schema unit", () => {
    const r = resolveProperties(led, { forwardVoltage: 12, pins: 0 }, "properties");
    expect(!r.ok && r.issues.map((i) => i.path)).toEqual([
      "properties.forwardVoltage",
      "properties.pins",
    ]);
  });

  it("requires values without a default and rejects undeclared ones", () => {
    const r = resolveProperties(led, { typo: 1 });
    expect(!r.ok && r.issues.map((i) => i.path).sort()).toEqual(["forwardVoltage", "pins", "typo"]);
  });

  it("rejects enum values outside the options", () => {
    expect(resolveProperties(led, { forwardVoltage: 2, pins: 2, color: "pink" }).ok).toBe(false);
  });
});

describe("PropertyDefinitionSchema", () => {
  it("rejects unknown units and unknown keys", () => {
    expect(PropertyDefinitionSchema.safeParse({ type: "number", unit: "furlong" }).success).toBe(
      false,
    );
    expect(PropertyDefinitionSchema.safeParse({ type: "number", unti: "V" }).success).toBe(false);
  });
});
