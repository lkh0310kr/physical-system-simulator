import { describe, expect, it } from "vitest";
import { pushFrame, type ScopeHistory, toPoints } from "./scope-history.ts";

describe("scope history", () => {
  it("records numeric and boolean signals and ignores strings", () => {
    const h = pushFrame({}, 0, { "a.v": 1.5, "b.on": true, "c.phase": "sleep" });
    expect(Object.keys(h).sort()).toEqual(["a.v", "b.on"]);
    expect(h["b.on"]?.[0]?.v).toBe(1);
  });

  it("keeps only the last window seconds", () => {
    let h: ScopeHistory = {};
    for (let t = 0; t <= 10; t += 1) h = pushFrame(h, t, { x: t }, 5);
    expect(h.x?.[0]?.t).toBe(5);
    expect(h.x?.at(-1)?.t).toBe(10);
  });

  it("clears the history when simulation time goes backwards (reset)", () => {
    let h: ScopeHistory = {};
    h = pushFrame(h, 3, { x: 1 });
    h = pushFrame(h, 0, { x: 2 });
    expect(h.x).toHaveLength(1);
    expect(h.x?.[0]?.v).toBe(2);
  });

  it("maps the newest sample to the right edge and scales to the range", () => {
    const pts = toPoints(
      [
        { t: 0, v: 0 },
        { t: 5, v: 4 },
      ],
      100,
      40,
      5,
      [0, 4],
    );
    expect(pts).toBe("0.0,40.0 100.0,0.0");
  });

  it("draws a flat signal in the middle instead of dividing by zero", () => {
    const pts = toPoints(
      [
        { t: 0, v: 3 },
        { t: 1, v: 3 },
      ],
      100,
      40,
      5,
    );
    expect(pts.split(" ").every((p) => p.endsWith(",20.0"))).toBe(true);
  });
});
