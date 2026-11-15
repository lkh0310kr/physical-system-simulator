import { describe, expect, it } from "vitest";
import { CapabilitySchema } from "./capability.ts";
import { ModelSchema, resolveBehaviorId } from "./model.ts";

const gpio = CapabilitySchema.parse({
  id: "capability.gpio",
  name: "GPIO",
  defaultBehavior: "behavior.digital-io",
});
const noDefault = CapabilitySchema.parse({ id: "capability.adc", name: "ADC" });

const uno = {
  id: "model.arduino-uno",
  name: "Arduino UNO",
  category: "electronics/board",
  propertySchema: { operatingVoltage: { type: "number", unit: "V" } },
  properties: { operatingVoltage: 5 },
  components: [{ name: "mcu", model: "model.atmega328p" }],
  capabilities: [{ capability: "capability.gpio", config: { pinCount: 20 } }],
};

describe("ModelSchema", () => {
  it("parses the five model areas and fills defaults", () => {
    const m = ModelSchema.parse({ id: "model.led", name: "LED", category: "electronics/output" });
    expect(m).toMatchObject({
      propertySchema: {},
      properties: {},
      components: [],
      capabilities: [],
    });
    expect(ModelSchema.parse(uno).components[0]?.model).toBe("model.atmega328p");
  });

  it("keeps unknown metadata fields but rejects unknown top-level fields", () => {
    const m = ModelSchema.parse({ ...uno, metadata: { manufacturer: "Arduino", sku: "A000066" } });
    expect(m.metadata.sku).toBe("A000066");
    expect(ModelSchema.safeParse({ ...uno, colour: "blue" }).success).toBe(false);
  });

  it("rejects duplicate component names and duplicate capability bindings", () => {
    const r = ModelSchema.safeParse({
      ...uno,
      components: [...uno.components, { name: "mcu", model: "model.other" }],
      capabilities: [...uno.capabilities, { capability: "capability.gpio" }],
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path.join("."))).toEqual([
      "components.1",
      "capabilities.1",
    ]);
  });
});

describe("ports", () => {
  it("parses ports with a domain and rejects duplicate names or unknown domains", () => {
    const ports = [
      { name: "A", domain: "electrical" },
      { name: "C", domain: "electrical" },
    ];
    expect(ModelSchema.parse({ ...uno, ports }).ports).toHaveLength(2);
    expect(ModelSchema.safeParse({ ...uno, ports: [...ports, ports[0]] }).success).toBe(false);
    expect(
      ModelSchema.safeParse({ ...uno, ports: [{ name: "A", domain: "thermal" }] }).success,
    ).toBe(false);
    expect(
      ModelSchema.safeParse({ ...uno, ports: [{ name: "a:b", domain: "electrical" }] }).success,
    ).toBe(false);
  });
});

describe("resolveBehaviorId (spec §14.2)", () => {
  it("uses the model binding override first", () => {
    const binding = { capability: "capability.gpio", config: {}, behavior: "behavior.esp32-io" };
    expect(resolveBehaviorId(binding, gpio)).toBe("behavior.esp32-io");
  });

  it("falls back to the capability default behavior", () => {
    expect(resolveBehaviorId({ capability: "capability.gpio", config: {} }, gpio)).toBe(
      "behavior.digital-io",
    );
  });

  it("returns undefined when neither is set", () => {
    expect(
      resolveBehaviorId({ capability: "capability.adc", config: {} }, noDefault),
    ).toBeUndefined();
  });
});
