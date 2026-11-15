import { describe, expect, it } from "vitest";
import { dirOf, joinPath } from "./project-client.ts";

describe("project paths", () => {
  it("resolves document-relative paths to project paths", () => {
    expect(joinPath(dirOf("blink-led.system.json"), "blink.js")).toBe("blink.js");
    expect(joinPath(dirOf("robots/car.system.json"), "../models/led.json")).toBe("models/led.json");
    expect(joinPath("a/b", "./c/d.js")).toBe("a/b/c/d.js");
  });
});
