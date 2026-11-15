import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listProjectFiles, resolveInside } from "./project-api.ts";

describe("resolveInside", () => {
  const root = "/project";
  it("resolves relative paths inside the project", () => {
    expect(resolveInside(root, "models/led.json")).toBe("/project/models/led.json");
  });

  it("refuses paths that escape the project", () => {
    expect(resolveInside(root, "../secret.json")).toBeUndefined();
    expect(resolveInside(root, "/etc/passwd")).toBeUndefined();
    expect(resolveInside(root, "a/../../b")).toBeUndefined();
    expect(resolveInside(root, "")).toBeUndefined();
  });
});

describe("listProjectFiles", () => {
  it("lists .json and .js files recursively, skipping hidden and dependency folders", () => {
    const root = mkdtempSync(join(tmpdir(), "physisim-web-"));
    for (const dir of ["models", "node_modules/x", ".git"])
      mkdirSync(join(root, dir), { recursive: true });
    for (const f of [
      "a.system.json",
      "blink.js",
      "notes.md",
      "models/led.json",
      "node_modules/x/y.json",
      ".git/z.json",
    ]) {
      writeFileSync(join(root, f), "{}");
    }
    expect(listProjectFiles(root)).toEqual(["a.system.json", "blink.js", "models/led.json"]);
  });
});
