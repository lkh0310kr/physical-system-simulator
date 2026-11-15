import { describe, expect, it } from "vitest";
import { capabilityJsonSchema, modelJsonSchema } from "./json-schema.ts";

describe("JSON Schema export", () => {
  it("describes the model authoring format with only identity fields required", () => {
    const schema = modelJsonSchema();
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(["id", "name", "category"]);
    expect(Object.keys(schema.properties ?? {})).toContain("capabilities");
    expect(schema.additionalProperties).toBe(false);
  });

  it("describes the capability authoring format", () => {
    expect(capabilityJsonSchema().required).toEqual(["id", "name"]);
  });

  it("is plain JSON", () => {
    expect(JSON.parse(JSON.stringify(modelJsonSchema()))).toEqual(modelJsonSchema());
  });
});
