import type { Trace } from "@physisim/engine";
import { describe, expect, it } from "vitest";
import { analyzeCaptures, batteryLifeDays } from "./report.ts";

/** 손으로 만든 trace: 1.0 s 깨어남 → 2.0 s 전송 완료, 그 사이 3.6 C(= 1 mAh), 5 J가 나갔다. */
const trace: Trace = {
  entries: [
    { time: 0, signal: "node.phase", value: "sleep" },
    { time: 0, signal: "node.current", value: 1e-5 },
    { time: 0, signal: "bat.charge", value: 0 },
    { time: 0, signal: "bat.energy", value: 0 },
    { time: 1, signal: "node.phase", value: "boot" },
    { time: 1, signal: "bat.charge", value: 0 },
    { time: 1.5, signal: "bat.charge", value: 1.8 },
    { time: 1.5, signal: "bat.energy", value: 2.5 },
    { time: 2, signal: "bat.charge", value: 3.6 },
    { time: 2, signal: "bat.energy", value: 5 },
    { time: 2, signal: "node.phase", value: "sleep" },
    { time: 2, signal: "node.sent", value: 1 },
    { time: 3, signal: "node.phase", value: "boot" }, // 전송을 못 마친 촬영
  ],
  final: {},
  steps: 0,
};

describe("analyzeCaptures", () => {
  const r = analyzeCaptures(trace, { node: "node", battery: "bat" });

  it("pairs each wake with its delivery and ignores unfinished captures", () => {
    expect(r.captures).toHaveLength(1);
    expect(r.captures[0]).toMatchObject({ wakeAt: 1, deliveredAt: 2, latency: 1 });
  });

  it("measures the charge and energy that left the battery during a capture", () => {
    expect(r.captures[0]?.chargeMah).toBeCloseTo(1, 9);
    expect(r.captures[0]?.energyJ).toBeCloseTo(5, 9);
  });

  it("reads the sleep current from the first node.current value", () => {
    expect(r.sleepMicroamps).toBeCloseTo(10, 9);
  });
});

describe("batteryLifeDays", () => {
  it("divides capacity by captures per day plus the sleep drain", () => {
    const r = analyzeCaptures(trace, { node: "node", battery: "bat" });
    // 하루 10장 × 1 mAh + 절전 0.01 mA × 24 h = 10.24 mAh/일
    expect(batteryLifeDays(r, 500, 10)).toBeCloseTo(500 / 10.24, 6);
  });

  it("is infinite when nothing is drawn", () => {
    expect(
      batteryLifeDays(
        { captures: [], sleepMicroamps: 0, meanLatency: 0, meanChargeMah: 0 },
        500,
        0,
      ),
    ).toBe(Number.POSITIVE_INFINITY);
  });
});
