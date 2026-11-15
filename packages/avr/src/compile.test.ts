import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileSketch, parseCompilerErrors } from "./compile.ts";

const hasArduinoCli = (() => {
  try {
    execFileSync("arduino-cli", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe("parseCompilerErrors", () => {
  it("extracts file:line:col errors and ignores warnings", () => {
    const out = [
      "/tmp/x/sketch/sketch.ino:5:3: error: 'digitalWrit' was not declared in this scope",
      "/tmp/x/sketch/sketch.ino:2:1: warning: unused variable",
      "/tmp/x/sketch/sketch.ino:9:1: error: expected ';' before '}' token",
    ].join("\n");
    expect(parseCompilerErrors(out, "blink.ino")).toEqual([
      { path: "blink.ino:5:3", message: "'digitalWrit' was not declared in this scope" },
      { path: "blink.ino:9:1", message: "expected ';' before '}' token" },
    ]);
  });
});

describe.skipIf(!hasArduinoCli)("compileSketch (needs arduino-cli; skipped in CI)", () => {
  const cacheDir = mkdtempSync(join(tmpdir(), "physisim-compile-"));
  const blink = readFileSync(join(import.meta.dirname, "fixtures/blink.ino"), "utf8");

  it("compiles a sketch to Intel HEX and serves the second build from cache", async () => {
    const first = await compileSketch(blink, { cacheDir });
    expect(first.ok && first.value.startsWith(":")).toBe(true);
    const t = performance.now();
    const second = await compileSketch(blink, { cacheDir });
    expect(second).toEqual(first);
    expect(performance.now() - t).toBeLessThan(100);
  }, 120_000);

  it("reports compiler errors at their line in the original file", async () => {
    const r = await compileSketch("void setup() { digitalWrit(13, HIGH); }\nvoid loop() {}\n", {
      cacheDir,
      fileName: "broken.ino",
    });
    expect(!r.ok && r.issues[0]?.path).toBe("broken.ino:1:16");
  }, 120_000);
});

describe("compileSketch without arduino-cli", () => {
  it("explains how to install it", async () => {
    const r = await compileSketch("void setup(){}", {
      cli: "definitely-not-arduino-cli",
      cacheDir: mkdtempSync(join(tmpdir(), "p-")),
    });
    expect(!r.ok && r.issues[0]?.message).toContain("brew install arduino-cli");
  });
});
