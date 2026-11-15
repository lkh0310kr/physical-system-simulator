import { loadSystemProject } from "@physisim/core";
import { createStandardRegistry } from "@physisim/models";
import { describe, expect, it } from "vitest";
import { runLoaded } from "./simulate.ts";

/** 배터리 하나가 두 모터를 구동하고, 모터 축이 차체 바퀴 축에 연결된 로봇. `reverseRight`면 오른쪽 모터 극성을 뒤집는다. */
function robot(reverseRight = false) {
  const r = loadSystemProject(
    {
      name: "robot",
      instances: [
        { id: "bat", model: "model.li-ion-cell", properties: { capacity: 2000 } },
        { id: "ml", model: "model.tt-motor" },
        { id: "mr", model: "model.tt-motor" },
        { id: "car", model: "model.robot-chassis-2wd" },
      ],
      connections: [
        ["bat:+", "ml:A"],
        ["bat:-", "ml:B"],
        reverseRight ? ["bat:-", "mr:A"] : ["bat:+", "mr:A"],
        reverseRight ? ["bat:+", "mr:B"] : ["bat:-", "mr:B"],
        ["ml:shaft", "car:left"],
        ["mr:shaft", "car:right"],
      ],
    },
    () => undefined,
    createStandardRegistry,
  );
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

const run = (reverseRight: boolean, seconds: number) =>
  runLoaded(robot(reverseRight), { duration: seconds, dt: 0.001, presses: [] }, new Map()).trace
    .final;

describe("2-wheel robot: motors → shafts → wheels → pose (P7-T9)", () => {
  it("drives straight when both motors get the same voltage: forward speed near the motor's loaded speed", () => {
    const f = run(false, 3);
    expect(Number(f["car.speed"])).toBeGreaterThan(0.4);
    expect(Number(f["car.speed"])).toBeLessThan(1.0);
    expect(Math.abs(Number(f["car.heading"]))).toBeLessThan(1e-6);
    expect(Number(f["car.x"])).toBeGreaterThan(1.0);
    expect(Math.abs(Number(f["car.y"]))).toBeLessThan(1e-6);
  });

  it("spins in place when the motors run in opposite directions", () => {
    const f = run(true, 2);
    expect(Math.abs(Number(f["car.speed"]))).toBeLessThan(1e-6);
    expect(Math.abs(Number(f["car.heading"]))).toBeGreaterThan(1);
    expect(Math.abs(Number(f["car.x"]))).toBeLessThan(0.01);
  });

  it("the motor's back-EMF lowers its current as it speeds up: stall current ≫ running current", () => {
    const early = runLoaded(robot(false), { duration: 0.002, dt: 0.001, presses: [] }, new Map())
      .trace.final;
    const steady = run(false, 3);
    expect(Number(early["ml.current"])).toBeGreaterThan(Number(steady["ml.current"]) * 3);
    // 정상 상태 전류는 무부하(약 0.16 A)보다 조금 크다
    expect(Number(steady["ml.current"])).toBeGreaterThan(0.1);
    expect(Number(steady["ml.current"])).toBeLessThan(0.6);
  });

  it("is deterministic: the same run gives the same pose", () => {
    expect(run(false, 1)["car.x"]).toBe(run(false, 1)["car.x"]);
  });
});
