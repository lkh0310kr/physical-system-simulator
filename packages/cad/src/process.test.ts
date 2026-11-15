import { describe, expect, it } from "vitest";
import { fdmProfile, ProcessProfileSchema, resolveProfile } from "./process.ts";

describe("process profile", () => {
  it("default FDM profile satisfies its own schema", () => {
    expect(ProcessProfileSchema.safeParse(fdmProfile).success).toBe(true);
  });

  it("rejects a wall thinner than the minimum wall", () => {
    const r = resolveProfile({ wall: 0.5 });
    expect(r.ok).toBe(false);
  });

  it("partial override keeps other FDM defaults", () => {
    const r = resolveProfile({ partClearance: 0.5 });
    expect(r.ok && r.value.partClearance).toBe(0.5);
    expect(r.ok && r.value.minWall).toBe(fdmProfile.minWall);
  });

  it("does not treat inherited object properties as a process name", () => {
    for (const name of ["constructor", "toString", "__proto__"])
      expect(resolveProfile(name).ok).toBe(false);
  });

  it("unknown process name is reported with the available ones", () => {
    const r = resolveProfile("sla");
    expect(!r.ok && r.message).toContain("fdm");
  });
});
