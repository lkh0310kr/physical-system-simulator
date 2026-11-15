import { loadSystemProject } from "@physisim/core";
import { createStandardRegistry } from "@physisim/models";
import { describe, expect, it } from "vitest";
import { runLoaded } from "./simulate.ts";

/** 배터리 → 서보 전원, 신호 발생기 → 서보 명령. */
function load(gen: Record<string, unknown>, powered = true) {
  const r = loadSystemProject(
    {
      name: "servo",
      instances: [
        { id: "bat", model: "model.li-ion-cell", properties: { capacity: 1000 } },
        { id: "gen", model: "model.signal-generator", properties: gen },
        { id: "sv", model: "model.servo-sg92r" },
      ],
      connections: [
        ...(powered ? [["bat:+", "sv:VCC"]] : []),
        ["bat:-", "sv:GND"],
        ["gen:out", "sv:command"],
      ],
    },
    () => undefined,
    createStandardRegistry,
  );
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

const run = (gen: Record<string, unknown>, seconds: number, powered = true) =>
  runLoaded(load(gen, powered), { duration: seconds, dt: 0.001, presses: [] }, new Map()).trace;

describe("servo (P6-T3b)", () => {
  it("follows a step command and arrives after about angle / speed seconds (0.1 s per 60° → 90° in ~0.15 s)", () => {
    const t = run({ waveform: "square", amplitude: 1.5, frequency: 0.2, offset: 0 }, 1.2);
    // 사각파 +1.5 rad(약 86°)로 시작: 속도 10.47 rad/s → 약 0.143 s
    const reached = t.entries.find((e) => e.signal === "sv.angle" && Number(e.value) >= 1.499);
    expect(reached?.time).toBeGreaterThan(0.12);
    expect(reached?.time).toBeLessThan(0.17);
  });

  it("never turns faster than the product's speed, even for a sudden large command", () => {
    const t = run({ waveform: "square", amplitude: 1.5, frequency: 1, offset: 0 }, 1);
    const angles = t.entries.filter((e) => e.signal === "sv.angle");
    for (let i = 1; i < angles.length; i++) {
      const a = angles[i];
      const b = angles[i - 1];
      if (!a || !b) continue;
      const rate = Math.abs(Number(a.value) - Number(b.value)) / Math.max(1e-9, a.time - b.time);
      expect(rate).toBeLessThan(10.6);
    }
  });

  it("clamps a command beyond the travel range to the range limit (±90°)", () => {
    const t = run({ waveform: "square", amplitude: 3, frequency: 0.1, offset: 0 }, 1);
    expect(Number(t.final["sv.angle"])).toBeCloseTo(Math.PI / 2, 3);
  });

  it("does not move without a supply", () => {
    const t = run({ waveform: "square", amplitude: 1.5, frequency: 0.2, offset: 0 }, 0.5, false);
    expect(Number(t.final["sv.angle"])).toBe(0);
  });
});
