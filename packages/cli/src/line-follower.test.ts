import { readFileSync } from "node:fs";
import { loadSystemProject } from "@physisim/core";
import { createStandardRegistry } from "@physisim/models";
import { describe, expect, it } from "vitest";
import { runLoaded } from "./simulate.ts";
import { tuneSystem } from "./tune.ts";

function load(pid: Record<string, number> = {}) {
  const json = JSON.parse(readFileSync("examples/line-follower.system.json", "utf8"));
  const inst = json.instances.find((i: { id: string }) => i.id === "pid");
  inst.properties = { ...inst.properties, ...pid };
  const r = loadSystemProject(json, () => undefined, createStandardRegistry);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

const run = (pid: Record<string, number> = {}, seconds = 8) =>
  runLoaded(load(pid), { duration: seconds, dt: 0.001, presses: [] }, new Map()).trace;

describe("line-following robot (P8-T2)", () => {
  it("stays on the sine line: the sensor offset stays within 12 cm and the car keeps moving forward", () => {
    const t = run();
    const offsets = t.entries.filter((e) => e.signal === "eye.offset").map((e) => Number(e.value));
    expect(Math.max(...offsets.map(Math.abs))).toBeLessThan(0.12);
    expect(Number(t.final["car.x"])).toBeGreaterThan(1.5);
  });

  it("is steady near the end of the run: small offset and low error integral growth", () => {
    const t = run();
    expect(Math.abs(Number(t.final["eye.offset"]))).toBeLessThan(0.05);
  });

  it("a weak steering gain follows worse than a good one (larger error integral)", () => {
    const weak = Number(run({ kp: 0.3, kd: 0 }).final["pid.ise"]);
    const good = Number(run({ kp: 4, kd: 0.2 }).final["pid.ise"]);
    expect(weak).toBeGreaterThan(good * 3);
  });

  it("gain search picks a stronger kp than the weakest candidate", async () => {
    const r = await tuneSystem(
      "examples/line-follower.system.json",
      { instance: "pid", key: "kp", lo: 0.3, hi: 10 },
      { signal: "pid.ise", direction: "min", stat: "final" },
      [],
      { duration: 6, dt: 0.001 },
      6,
    );
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.value.best?.value ?? 0).toBeGreaterThan(1);
  });
});
