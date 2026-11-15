import { describe, expect, it } from "vitest";
import { fitLabel } from "./part.tsx";

describe("fitLabel", () => {
  it("keeps a name that fits and shortens one that does not, ending with an ellipsis", () => {
    expect(fitLabel("LED", 120)).toBe("LED");
    const long = "DC Gearbox Motor — TT Motor 200RPM (Adafruit 3777)";
    const out = fitLabel(long, 110);
    expect(out.length).toBeLessThan(long.length);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length * 7).toBeLessThanOrEqual(110 - 16 + 7);
  });
});
