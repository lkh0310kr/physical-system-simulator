import { describe, expect, it } from "vitest";
import { filterSystems } from "./examples-panel.tsx";

const items = [
  {
    path: "robot-avoid.system.json",
    name: "Obstacle-avoiding robot",
    description: "초음파 센서로 벽을 피한다",
    parts: 9,
  },
  { path: "blink-led.system.json", name: "Blink", description: "LED 깜빡임", parts: 3 },
];

describe("filterSystems", () => {
  it("matches name, description and path case-insensitively, and returns everything for an empty query", () => {
    expect(filterSystems(items, "")).toHaveLength(2);
    expect(filterSystems(items, "OBSTACLE").map((s) => s.path)).toEqual([
      "robot-avoid.system.json",
    ]);
    expect(filterSystems(items, "깜빡").map((s) => s.path)).toEqual(["blink-led.system.json"]);
    expect(filterSystems(items, "nothing")).toEqual([]);
  });
});
