import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSystem, formatIssues, parseSystem } from "@physisim/core";
import { describe, expect, it } from "vitest";
import { createStandardRegistry } from "./index.ts";

const dir = join(import.meta.dirname, "../../../examples");
const files = readdirSync(dir).filter((f) => f.endsWith(".system.json"));
const registry = createStandardRegistry();

function build(file: string) {
  const doc = parseSystem(JSON.parse(readFileSync(join(dir, file), "utf8")));
  if (!doc.ok) throw new Error(formatIssues(doc.issues));
  const built = buildSystem(registry, doc.value);
  if (!built.ok) throw new Error(formatIssues(built.issues));
  return built.value;
}

describe("examples", () => {
  it.each(files)("%s builds against the standard library", (file) => {
    expect(() => build(file)).not.toThrow();
  });

  it("wires blink-led as D13 → resistor → LED → GND", () => {
    const blink = build("blink-led.system.json");
    expect(blink.nets.map((n) => n.ports)).toEqual([
      ["uno:D13", "r1:1"],
      ["r1:2", "led1:A"],
      ["led1:C", "uno:GND.1"],
    ]);
    expect(blink.instances.find((i) => i.id === "r1")?.properties.resistance).toBe(220);
  });
});
