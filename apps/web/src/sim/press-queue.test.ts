import { describe, expect, it } from "vitest";
import { PressQueue } from "./press-queue.ts";

describe("PressQueue", () => {
  it("releases immediately when the simulation has already run since the press", () => {
    const q = new PressQueue();
    q.press("btn");
    q.tick(); // 시뮬레이션이 한 번 진행됨
    expect(q.release("btn")).toBe(true);
  });

  it("defers a release that arrives before any simulation progress, then returns it on the next tick", () => {
    const q = new PressQueue();
    q.press("btn");
    expect(q.release("btn")).toBe(false);
    expect(q.tick()).toEqual(["btn"]);
    expect(q.tick()).toEqual([]);
  });

  it("forgets a deferred release when the same part is pressed again", () => {
    const q = new PressQueue();
    q.press("btn");
    q.release("btn");
    q.press("btn");
    expect(q.tick()).toEqual([]);
  });

  it("tracks parts independently", () => {
    const q = new PressQueue();
    q.press("a");
    q.tick();
    q.press("b");
    expect(q.release("a")).toBe(true);
    expect(q.release("b")).toBe(false);
  });
});
