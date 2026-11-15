import { describe, expect, it } from "vitest";
import { defineBehavior } from "./behavior.ts";
import { CapabilitySchema } from "./capability.ts";
import { type ModelInput, ModelSchema } from "./model.ts";
import { createRegistry } from "./registry.ts";

const digitalIo = defineBehavior({
  id: "behavior.digital-io",
  init: () => ({ level: false }),
  step: (state) => ({ state, outputs: {} }),
});

const gpio = CapabilitySchema.parse({
  id: "capability.gpio",
  name: "GPIO",
  parameters: { pinCount: { type: "integer", min: 1 } },
  defaultBehavior: "behavior.digital-io",
});

const model = (input: Partial<ModelInput> & { id: string }) =>
  ModelSchema.parse({ name: input.id, category: "test", ...input });

function registry(...models: ReturnType<typeof model>[]) {
  const r = createRegistry();
  r.addBehavior(digitalIo);
  r.addCapability(gpio);
  for (const m of models) r.addModel(m);
  return r;
}

const paths = (r: ReturnType<typeof registry>) => r.validate().map((i) => i.path);

describe("createRegistry", () => {
  it("looks definitions up by ID and rejects duplicate IDs", () => {
    const r = registry(model({ id: "model.led" }));
    expect(r.getModel("model.led")?.id).toBe("model.led");
    expect(r.addModel(model({ id: "model.led" })).ok).toBe(false);
  });

  it("passes a model whose references all resolve", () => {
    const r = registry(
      model({
        id: "model.mcu",
        capabilities: [{ capability: "capability.gpio", config: { pinCount: 8 } }],
      }),
      model({ id: "model.board", components: [{ name: "mcu", model: "model.mcu" }] }),
    );
    expect(r.validate()).toEqual([]);
  });

  it("validates model property values against the model's property schema", () => {
    const r = registry(
      model({
        id: "model.led",
        propertySchema: { forwardVoltage: { type: "number", unit: "V" } },
        properties: { forwardVoltage: "2A" },
      }),
    );
    expect(paths(r)).toEqual(["model.led:properties.forwardVoltage"]);
  });

  it("reports unknown components and capabilities", () => {
    const r = registry(
      model({
        id: "model.board",
        components: [{ name: "mcu", model: "model.missing" }],
        capabilities: [{ capability: "capability.missing" }],
      }),
    );
    expect(paths(r)).toEqual([
      "model.board:components[0].model",
      "model.board:capabilities[0].capability",
    ]);
  });

  it("validates binding config against the capability parameters", () => {
    const r = registry(
      model({
        id: "model.mcu",
        capabilities: [{ capability: "capability.gpio", config: { pinCount: 0 } }],
      }),
    );
    expect(paths(r)).toEqual(["model.mcu:capabilities[0].config.pinCount"]);
  });

  it("reports a binding whose resolved behavior is not registered", () => {
    const r = registry(
      model({
        id: "model.esp32",
        capabilities: [
          {
            capability: "capability.gpio",
            config: { pinCount: 34 },
            behavior: "behavior.esp32-io",
          },
        ],
      }),
    );
    expect(r.validate()[0]?.message).toContain("behavior.esp32-io");
  });

  it("reports a binding with neither an override nor a capability default", () => {
    const r = registry(
      model({ id: "model.mcu", capabilities: [{ capability: "capability.adc" }] }),
    );
    r.addCapability(CapabilitySchema.parse({ id: "capability.adc", name: "ADC" }));
    expect(r.validate()[0]?.message).toContain("Behavior가 없다");
  });

  it("detects component cycles", () => {
    const r = registry(
      model({ id: "model.a", components: [{ name: "b", model: "model.b" }] }),
      model({ id: "model.b", components: [{ name: "a", model: "model.a" }] }),
    );
    expect(r.validate().map((i) => i.message)).toEqual([
      "Component 순환: model.a → model.b → model.a",
    ]);
  });
});
