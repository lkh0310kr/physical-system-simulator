import { describe, expect, it } from "vitest";
import { defineBehavior } from "./behavior.ts";
import { formatIssues } from "./issues.ts";
import { loadLibrary, parseModel } from "./loader.ts";

const behaviors = [
  defineBehavior({
    id: "behavior.digital-io",
    init: () => ({}),
    step: (state) => ({ state, outputs: {} }),
  }),
];
const capabilities = [
  { id: "capability.gpio", name: "GPIO", defaultBehavior: "behavior.digital-io" },
];

describe("parseModel", () => {
  it("returns issues prefixed with the model ID instead of throwing", () => {
    const r = parseModel({
      id: "model.led",
      name: "LED",
      category: "x",
      components: [{ name: 1 }],
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.issues.map((i) => i.path)).toEqual([
      "model.led:components[0].name",
      "model.led:components[0].model",
    ]);
  });

  it("handles input that is not an object", () => {
    expect(parseModel(null).ok).toBe(false);
  });
});

describe("loadLibrary", () => {
  it("loads valid JSON definitions into a validated registry", () => {
    const r = loadLibrary({
      behaviors,
      capabilities,
      models: [
        {
          id: "model.mcu",
          name: "MCU",
          category: "electronics/mcu",
          capabilities: [{ capability: "capability.gpio" }],
        },
      ],
    });
    expect(r.ok && r.value.getModel("model.mcu")?.name).toBe("MCU");
  });

  it("labels items without an ID by their position", () => {
    const r = loadLibrary({ models: [{ name: "no id" }] });
    expect(!r.ok && r.issues[0]?.path).toMatch(/^models\[0\]:/);
  });

  it("reports reference errors only after every definition parses", () => {
    const r = loadLibrary({
      behaviors,
      capabilities,
      models: [
        {
          id: "model.board",
          name: "Board",
          category: "x",
          components: [{ name: "mcu", model: "model.mcu" }],
        },
      ],
    });
    expect(!r.ok && formatIssues(r.issues)).toBe(
      "- model.board:components[0].model: 등록되지 않은 Model: model.mcu",
    );
  });
});
