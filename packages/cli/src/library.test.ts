import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSystemFile, runLoaded } from "./simulate.ts";

/** 임시 프로젝트 폴더에 파일들을 쓰고 경로를 돌려준다. */
function project(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "physisim-"));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), typeof content === "string" ? content : JSON.stringify(content));
  }
  return dir;
}

const brightLed = {
  id: "model.bright-led",
  name: "Bright LED",
  category: "electronics/output",
  propertySchema: {
    forwardVoltage: { type: "number", unit: "V" },
    maxCurrent: { type: "number", unit: "mA" },
    dynamicResistance: { type: "number", unit: "Ω" },
  },
  properties: { forwardVoltage: 2, maxCurrent: 10, dynamicResistance: 10 },
  ports: [
    { name: "A", domain: "electrical" },
    { name: "C", domain: "electrical" },
  ],
  capabilities: [{ capability: "capability.light-emission" }],
};

const system = (library: string[]) => ({
  name: "custom",
  library,
  instances: [
    { id: "uno", model: "model.arduino-uno", program: "p.js" },
    { id: "led1", model: "model.bright-led" },
  ],
  connections: [
    ["uno:D13", "led1:A"],
    ["led1:C", "uno:GND.1"],
  ],
});

const program = "function setup() { pinMode(13, OUTPUT); digitalWrite(13, HIGH); }";

describe("local library", () => {
  it("loads user models next to the system and runs them with standard behaviors", () => {
    const dir = project({
      "bright-led.json": brightLed,
      "s.json": system(["bright-led.json"]),
      "p.js": program,
    });
    const loaded = loadSystemFile(join(dir, "s.json"));
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.issues));
    const { trace } = runLoaded(loaded.value, { duration: 0.001 });
    expect(trace.final["led1.brightness"]).toBe(1); // 3V / 35Ω ≈ 86mA > 10mA
  });

  it("reports an unknown model when the library file is not listed", () => {
    const dir = project({ "s.json": system([]), "p.js": program });
    const r = loadSystemFile(join(dir, "s.json"));
    expect(!r.ok && r.issues[0]?.message).toContain("model.bright-led");
  });

  it("reports library files by their path", () => {
    const dir = project({
      "s.json": system(["missing.json", "bad.json"]),
      "bad.json": { id: "thing" },
    });
    const r = loadSystemFile(join(dir, "s.json"));
    expect(!r.ok && r.issues.map((i) => i.path)).toEqual(["missing.json", "bad.json"]);
  });

  it("validates user models like standard ones", () => {
    const broken = { ...brightLed, capabilities: [{ capability: "capability.nope" }] };
    const dir = project({
      "bright-led.json": broken,
      "s.json": system(["bright-led.json"]),
      "p.js": program,
    });
    const r = loadSystemFile(join(dir, "s.json"));
    expect(!r.ok && r.issues[0]?.path).toBe("model.bright-led:capabilities[0].capability");
  });
});
