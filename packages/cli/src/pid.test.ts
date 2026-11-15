import { readFileSync } from "node:fs";
import { loadSystemProject } from "@physisim/core";
import { createStandardRegistry, pid } from "@physisim/models";
import { describe, expect, it } from "vitest";
import { runLoaded } from "./simulate.ts";
import { tuneSystem } from "./tune.ts";

function load(props: Record<string, number>) {
  const json = JSON.parse(readFileSync("examples/motor-pid.system.json", "utf8"));
  json.instances.find((i: { id: string }) => i.id === "ctrl").properties = props;
  const r = loadSystemProject(json, () => undefined, createStandardRegistry);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}
const run = (props: Record<string, number>, seconds = 4) =>
  runLoaded(load(props), { duration: seconds, dt: 0.001, presses: [] }, new Map()).trace.final;

describe("PID speed control (P8-T1)", () => {
  it("brings the motor to the target speed: integral action removes the steady-state error", () => {
    const f = run({ kp: 0.2, ki: 0.8, target: 15 });
    expect(Math.abs(Number(f["m.omega"]) - 15)).toBeLessThan(0.3);
  });

  it("proportional-only control leaves a steady-state error that the integral term removes", () => {
    const p = Math.abs(Number(run({ kp: 0.2, ki: 0, target: 15 })["m.omega"]) - 15);
    const pi = Math.abs(Number(run({ kp: 0.2, ki: 0.8, target: 15 })["m.omega"]) - 15);
    expect(p).toBeGreaterThan(pi * 3);
  });

  it("saturates at the output limit when the target is out of reach, without winding the integral up", () => {
    const f = run({ kp: 0.2, ki: 0.8, target: 500 }, 2);
    expect(Number(f["ctrl.output"])).toBe(1);
    // 와인드업이 없으니 목표를 낮추면 곧바로 따라간다: 같은 상태에서 상태만 보면 적분이 포화 이상으로 커지지 않는다
    const state = pid.init({ properties: {}, config: {} });
    let s = state;
    const props = { kp: 0.2, ki: 0.8, kd: 0, target: 500, outMin: -1, outMax: 1 };
    for (let i = 0; i < 2000; i++) {
      s = pid.step(
        s,
        { measurement: 10 },
        { time: i * 0.001, dt: 0.001, config: {}, properties: props },
      ).state;
    }
    // 오차 490, 적분 0.8×490 = 392로 쌓이면 와인드업 — 포화 중에는 갱신하지 않으므로 거의 0이다
    expect(s.integral).toBeLessThan(1);
  });

  it("tunes the integral gain by minimizing the error integral (ISE) over the run", async () => {
    const r = await tuneSystem(
      "examples/motor-pid.system.json",
      { instance: "ctrl", key: "ki", lo: 0.05, hi: 5 },
      { signal: "ctrl.ise", direction: "min", stat: "final" },
      [],
      { duration: 3, dt: 0.001 },
      8,
    );
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    const best = r.value.best;
    expect(best).toBeDefined();
    const worst = Math.max(...r.value.evaluated.map((c) => c.objective ?? 0));
    expect(best?.objective ?? Infinity).toBeLessThan(worst);
    // ki=0.05(거의 적분 없음)보다 훨씬 큰 값이 낫다
    expect(best?.value ?? 0).toBeGreaterThan(0.5);
  }, 60_000);
});
