import { readFileSync } from "node:fs";
import { loadSystemProject } from "@physisim/core";
import { createStandardRegistry } from "@physisim/models";
import { describe, expect, it } from "vitest";
import { runLoaded } from "./simulate.ts";

/** examples/robot-avoid: 센서 → 제어기 → 드라이버 → 모터 → 바퀴 → 차체 → 센서. `threshold`를 바꿔 반사실을 만든다. */
function load(threshold?: number) {
  const json = JSON.parse(readFileSync("examples/robot-avoid.system.json", "utf8"));
  if (threshold !== undefined) {
    json.instances.find((i: { id: string }) => i.id === "ctrl").properties = { threshold };
  }
  const r = loadSystemProject(json, () => undefined, createStandardRegistry);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

const run = (threshold?: number, seconds = 6) => {
  const { trace } = runLoaded(
    load(threshold),
    { duration: seconds, dt: 0.001, presses: [] },
    new Map(),
  );
  const xs = trace.entries.filter((e) => e.signal === "car.x").map((e) => Number(e.value));
  return { final: trace.final, maxX: Math.max(...xs), entries: trace.entries };
};

describe("obstacle-avoiding robot (P7-T11)", () => {
  it("stops short of the wall by turning away: front of the car never reaches the wall at x = 1 m", () => {
    const { maxX } = run();
    // 센서(차체 중심 앞 0.1 m)가 벽(1.0 m)을 넘지 않는다. 차체 앞면(0.1 m)이 벽보다 앞으로 나가면 안 된다.
    expect(maxX + 0.1).toBeLessThan(1.0);
  });

  it("starts turning when the measured distance drops below the threshold, and ends up heading along the wall", () => {
    const { final, entries } = run();
    const turnStart = entries.find((e) => e.signal === "ctrl.turning" && e.value === true);
    expect(turnStart).toBeDefined();
    // 바퀴가 가속하므로 처음 약 1 s 동안 벽 40 cm 앞(센서 기준)까지 달린다
    expect(turnStart?.time).toBeGreaterThan(0.5);
    expect(Math.abs(Number(final["car.heading"]))).toBeGreaterThan(1.0);
    expect(Math.abs(Number(final["car.y"]))).toBeGreaterThan(1);
  });

  it("without the avoidance rule (threshold 0) the same robot drives into the wall", () => {
    const { maxX } = run(0, 3);
    expect(maxX + 0.1).toBeGreaterThan(1.0);
  });

  it("is deterministic", () => {
    expect(run(undefined, 3).final["car.x"]).toBe(run(undefined, 3).final["car.x"]);
  });
});
