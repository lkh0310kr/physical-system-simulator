import { describe, expect, it } from "vitest";
import { CORE_VERSION } from "./index.ts";

describe("@physisim/core", () => {
  it("exposes a semver version", () => {
    expect(CORE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
