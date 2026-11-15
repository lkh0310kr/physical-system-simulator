import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkModelFile, formatReview } from "./check-model.ts";

const write = (def: unknown) => {
  const file = join(mkdtempSync(join(tmpdir(), "physisim-check-")), "m.json");
  writeFileSync(file, typeof def === "string" ? def : JSON.stringify(def));
  return file;
};

const good = {
  id: "model.test-resistor",
  name: "Test resistor",
  category: "electrical/passive",
  propertySchema: { resistance: { type: "number", unit: "Ω", min: 0 } },
  properties: { resistance: 100 },
  ports: [
    { name: "1", domain: "electrical" },
    { name: "2", domain: "electrical" },
  ],
  capabilities: [{ capability: "capability.resistance" }],
};

describe("physisim check", () => {
  it("accepts a valid new model and lists what a human must still confirm", () => {
    const r = checkModelFile(write(good));
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.value.notes.join("\n")).toContain("metadata.source");
    expect(r.value.notes.join("\n")).toContain("body");
    expect(formatReview(r.value)).toContain("아무것도 고치지 않는다");
  });

  it("rejects a schema error with the file and field in the message", () => {
    const r = checkModelFile(write({ ...good, ports: "x" }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.issues[0]?.path).toContain("ports");
  });

  it("rejects a reference to an unknown capability", () => {
    const r = checkModelFile(write({ ...good, capabilities: [{ capability: "capability.nope" }] }));
    expect(r.ok).toBe(false);
  });

  it("reviews an edited copy of a standard model by content, noting the duplicate id", () => {
    const r = checkModelFile(write({ ...good, id: "model.resistor" }));
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.value.notes.join("\n")).toContain("이미 있다");
  });

  it("rejects invalid JSON and ids without a model. or capability. prefix", () => {
    expect(checkModelFile(write("{")).ok).toBe(false);
    expect(checkModelFile(write({ id: "led" })).ok).toBe(false);
  });
});
