import { loadSystemProject } from "@physisim/core";
import { createStandardRegistry } from "@physisim/models";
import { describe, expect, it } from "vitest";
import { runLoaded } from "./simulate.ts";

/** 배터리 → 저항 → LED → 스위치 → 배터리. */
function load(model: string) {
  const r = loadSystemProject(
    {
      name: "tactile",
      instances: [
        { id: "bat", model: "model.li-ion-cell", properties: { capacity: 1000 } },
        { id: "r1", model: "model.resistor" },
        { id: "led1", model: "model.led" },
        { id: "sw", model },
      ],
      connections: [
        ["bat:+", "r1:1"],
        ["r1:2", "led1:A"],
        ["led1:C", "sw:1"],
        ["sw:2", "bat:-"],
      ],
    },
    () => undefined,
    createStandardRegistry,
  );
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

const run = (model: string) =>
  runLoaded(
    load(model),
    { duration: 0.8, dt: 0.001, presses: [{ instance: "sw", at: 0.1, hold: 0.5 }] },
    new Map(),
  ).trace.entries;

const firstAfter = (
  entries: ReturnType<typeof run>,
  signal: string,
  t: number,
  pred: (v: number) => boolean,
) => entries.find((e) => e.signal === signal && e.time >= t && pred(Number(e.value)))?.time;

describe("tactile switch mechanism (P7-T8)", () => {
  it("the contact closes only after the plunger travels to the operating point, not instantly", () => {
    const entries = run("model.tactile-12mm");
    const lit = firstAfter(entries, "led1.brightness", 0.1, (v) => v > 0.3);
    // pressTime 20 ms, 작동점 0.3/0.5 = 60% → 약 12 ms 뒤
    expect(lit).toBeGreaterThan(0.108);
    expect(lit).toBeLessThan(0.118);
  });

  it("the plunger goes down fully while pressed and the contact opens again on the way back up", () => {
    const entries = run("model.tactile-12mm");
    expect(
      Math.max(...entries.filter((e) => e.signal === "sw.plunger").map((e) => Number(e.value))),
    ).toBe(1);
    const dark = firstAfter(entries, "led1.brightness", 0.6, (v) => v < 0.05);
    // 놓은 뒤 80% 지점(= 플런저 0.48 → 0.48/0.5... 닫힘 유지 임계 0.48)까지 되돌아오는 시간
    expect(dark).toBeGreaterThan(0.6);
    expect(dark).toBeLessThan(0.63);
  });

  it("the ideal pushbutton still closes instantly", () => {
    const entries = run("model.pushbutton");
    const lit = firstAfter(entries, "led1.brightness", 0.1, (v) => v > 0.3);
    expect(lit).toBeLessThan(0.103);
  });
});
