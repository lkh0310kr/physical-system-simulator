import { describe, expect, it } from "vitest";
import { createScheduler, nextStepTime, toMicros, toSeconds } from "./clock.ts";

describe("scheduler", () => {
  it("pops due events by time, then in registration order for ties", () => {
    const s = createScheduler<string>();
    s.schedule(500, "b");
    s.schedule(100, "a");
    s.schedule(500, "c");
    s.schedule(900, "d");
    expect(s.nextTime()).toBe(100);
    expect(s.popDue(500)).toEqual(["a", "b", "c"]);
    expect(s.nextTime()).toBe(900);
    expect(s.popDue(899)).toEqual([]);
  });
});

describe("nextStepTime", () => {
  it("advances by the fixed step when no event is sooner", () => {
    expect(nextStepTime(0, 1000, 10_000)).toBe(1000);
  });

  it("lands exactly on an event that comes before the next fixed step", () => {
    expect(nextStepTime(0, 1000, 10_000, 250)).toBe(250);
  });

  it("never passes the end time", () => {
    expect(nextStepTime(9500, 1000, 10_000)).toBe(10_000);
  });
});

describe("time conversion", () => {
  it("keeps whole microseconds so repeated steps do not drift", () => {
    let t = 0;
    for (let i = 0; i < 1000; i++) t += toMicros(0.001);
    expect(toSeconds(t)).toBe(1);
  });
});
