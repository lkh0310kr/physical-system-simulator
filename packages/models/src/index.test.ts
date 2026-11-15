import { describe, expect, it } from "vitest";
import { createStandardRegistry, digitalIo, ledBehavior } from "./index.ts";

const ctx = { time: 0, dt: 0.001, config: {} };

describe("standard library", () => {
  const registry = createStandardRegistry();

  it("loads every definition without issues", () => {
    expect(registry.models().map((m) => m.id)).toEqual([
      "model.led",
      "model.resistor",
      "model.atmega328p",
      "model.arduino-uno",
    ]);
  });

  it("builds Arduino UNO from an ATmega328P component and shares the GPIO capability", () => {
    const uno = registry.getModel("model.arduino-uno");
    expect(uno?.components).toEqual([{ name: "mcu", model: "model.atmega328p" }]);
    expect(uno?.capabilities[0]?.capability).toBe("capability.gpio");
    expect(registry.getModel("model.atmega328p")?.capabilities[0]?.capability).toBe(
      "capability.gpio",
    );
  });
});

describe("behavior.digital-io", () => {
  const step = (inputs: Parameters<typeof digitalIo.step>[1]) =>
    digitalIo.step({}, inputs, { ...ctx, properties: {} }).outputs;

  it("drives the written level in output mode", () => {
    expect(step({ mode: "output", write: true, external: false })).toEqual({
      driving: true,
      level: true,
    });
  });

  it("reads the external level in input mode", () => {
    expect(step({ mode: "input", write: true, external: false })).toEqual({
      driving: false,
      level: false,
    });
  });
});

describe("behavior.led", () => {
  const brightness = (current: number) =>
    ledBehavior.step({}, { current }, { ...ctx, properties: { maxCurrent: 0.02 } }).outputs
      .brightness;

  it("scales brightness with current up to the maximum", () => {
    expect(brightness(0.01)).toBeCloseTo(0.5);
    expect(brightness(0.05)).toBe(1);
    expect(brightness(-0.01)).toBe(0);
  });
});
