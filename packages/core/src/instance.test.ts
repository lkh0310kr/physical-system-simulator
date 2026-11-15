import { describe, expect, it } from "vitest";
import { defineBehavior } from "./behavior.ts";
import { createInstance, InstanceDeclSchema } from "./instance.ts";
import { loadLibrary } from "./loader.ts";

const counter = defineBehavior({
  id: "behavior.counter",
  init: (ctx) => ({ count: 0, start: ctx.config.start }),
  step: (state) => ({ state, outputs: {} }),
});

const lib = loadLibrary({
  behaviors: [counter],
  capabilities: [
    {
      id: "capability.count",
      name: "Count",
      parameters: { start: { type: "integer" } },
      defaultBehavior: "behavior.counter",
    },
  ],
  models: [
    {
      id: "model.led",
      name: "LED",
      category: "x",
      propertySchema: {
        maxCurrent: { type: "number", unit: "mA" },
        color: { type: "enum", options: ["red", "green"] },
      },
      properties: { maxCurrent: 20, color: "red" },
      capabilities: [{ capability: "capability.count", config: { start: 3 } }],
    },
  ],
});
if (!lib.ok) throw new Error("fixture");
const registry = lib.value;

const decl = (input: unknown) => InstanceDeclSchema.parse(input);

describe("createInstance", () => {
  it("references the model and resolves its property values to SI", () => {
    const r = createInstance(registry, decl({ id: "led1", model: "model.led" }));
    expect(r.ok && r.value).toMatchObject({
      id: "led1",
      model: "model.led",
      properties: { maxCurrent: 0.02, color: "red" },
    });
  });

  it("applies per-instance property overrides on top of model values", () => {
    const r = createInstance(
      registry,
      decl({ id: "led1", model: "model.led", properties: { color: "green" } }),
    );
    expect(r.ok && r.value.properties.color).toBe("green");
  });

  it("validates overrides against the model's property schema", () => {
    const r = createInstance(
      registry,
      decl({ id: "led1", model: "model.led", properties: { color: "pink" } }),
    );
    expect(!r.ok && r.issues[0]?.path).toBe("led1.properties.color");
  });

  it("keeps one initial state per capability binding from the behavior's init", () => {
    const r = createInstance(registry, decl({ id: "led1", model: "model.led" }));
    expect(r.ok && r.value.state).toEqual({ "capability.count": { count: 0, start: 3 } });
  });

  it("reports an unknown model", () => {
    const r = createInstance(registry, decl({ id: "x", model: "model.missing" }));
    expect(!r.ok && r.issues[0]?.path).toBe("x.model");
  });

  it("rejects instance IDs that would clash with port references", () => {
    expect(InstanceDeclSchema.safeParse({ id: "led:1", model: "model.led" }).success).toBe(false);
  });
});
