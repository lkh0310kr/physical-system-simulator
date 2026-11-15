import { describe, expect, it } from "vitest";
import { CapabilitySchema } from "./capability.ts";

describe("CapabilitySchema", () => {
  it("parses a capability with signals, parameters and a default behavior", () => {
    const gpio = CapabilitySchema.parse({
      id: "capability.gpio",
      name: "GPIO",
      inputs: { write: { type: "boolean" } },
      outputs: { read: { type: "boolean" } },
      parameters: { pinCount: { type: "integer", min: 1 } },
      defaultBehavior: "behavior.digital-io",
    });
    expect(gpio.defaultBehavior).toBe("behavior.digital-io");
  });

  it("defaults inputs, outputs and parameters to empty", () => {
    const c = CapabilitySchema.parse({ id: "capability.light-emission", name: "Light" });
    expect(c).toMatchObject({ inputs: {}, outputs: {}, parameters: {} });
  });

  it("rejects IDs without the capability namespace or in the wrong case", () => {
    expect(CapabilitySchema.safeParse({ id: "gpio", name: "GPIO" }).success).toBe(false);
    expect(CapabilitySchema.safeParse({ id: "capability.GPIO", name: "GPIO" }).success).toBe(false);
    expect(CapabilitySchema.safeParse({ id: "model.gpio", name: "GPIO" }).success).toBe(false);
  });

  it("rejects behavior references that are not behavior IDs", () => {
    const r = CapabilitySchema.safeParse({
      id: "capability.gpio",
      name: "GPIO",
      defaultBehavior: "digital-io",
    });
    expect(r.success).toBe(false);
  });
});
