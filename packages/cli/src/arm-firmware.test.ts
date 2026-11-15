import { readFileSync } from "node:fs";
import { loadSystemProject } from "@physisim/core";
import { createStandardRegistry } from "@physisim/models";
import { describe, expect, it } from "vitest";
import { runLoaded } from "./simulate.ts";

const file = "examples/robot-arm-firmware/robot-arm-firmware.system.json";

function run(seconds: number, script?: string) {
  const json = JSON.parse(readFileSync(file, "utf8"));
  if (script !== undefined)
    json.instances.find((i: { id: string }) => i.id === "pc").properties.script = script;
  const r = loadSystemProject(json, () => undefined, createStandardRegistry);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return runLoaded(r.value, { duration: seconds, dt: 0.001, presses: [] }, new Map()).trace;
}

describe("robot arm: PC script → Serial → Uno firmware model → servos (A6/A7)", () => {
  const t = run(10);
  const sent = t.entries.filter((e) => e.signal === "pc.line").map((e) => String(e.value));

  it("sends the compiled Serial lines in script order: speed, home, gripper, joint moves", () => {
    expect(sent[0]).toBe("S 120");
    expect(sent[1]).toBe("HOME");
    expect(sent.filter((l) => l.startsWith("J ")).length).toBe(6);
    expect(sent.filter((l) => l.startsWith("G ")).map((l) => l)).toEqual([
      "G OPEN",
      "G CLOSE",
      "G OPEN",
    ]);
    expect(sent.at(-1)).toBe("STATUS");
  });

  it("every command was acknowledged and the final STATUS reply shows the arm back home and idle", () => {
    expect(t.final["pc.errors"]).toBe(0);
    expect(t.final["pc.done"]).toBe(true);
    expect(t.final["pc.lastReply"]).toBe("POS 0 0 0 0 0 MOVING 0");
  });

  it("picks the cube at (0.15, 0.07) and places it at (0.12, −0.08): displacement equals the difference", () => {
    expect(t.final["cube.held"]).toBe(false);
    expect(Number(t.final["cube.x"])).toBeCloseTo(-0.03, 2);
    expect(Number(t.final["cube.y"])).toBeCloseTo(-0.15, 2);
    expect(Number(t.final["cube.z"])).toBeCloseTo(0, 3);
  });

  it("the host waits for the arm: the next J is sent only after the previous move has ended (the moves take time)", () => {
    const times = t.entries
      .filter((e) => e.signal === "pc.line" && String(e.value).startsWith("J "))
      .map((e) => e.time);
    for (let i = 1; i < times.length; i++)
      expect((times[i] ?? 0) - (times[i - 1] ?? 0)).toBeGreaterThan(0.1);
  });

  it("reports compile errors for unreachable points and keeps running the rest of the script", () => {
    const bad = run(2, "MOVE 0.6 0 0.02\nPING");
    expect(bad.final["pc.errors"]).toBe(1);
    expect(bad.final["pc.lastReply"]).toBe("OK PING");
  });
});
