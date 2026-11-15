import { buildSystem, SystemSchema } from "@physisim/core";
import { createSimulation } from "@physisim/engine";
import { createStandardRegistry } from "@physisim/models";
import { describe, expect, it } from "vitest";

const registry = createStandardRegistry();

/** 풀업을 켠 D2 ← 버튼 → GND. 프로그램 대신 GPIO 이벤트로 pinMode(INPUT_PULLUP)를 보낸다. */
function buttonCircuit(model: string) {
  const built = buildSystem(
    registry,
    SystemSchema.parse({
      name: "button",
      instances: [
        { id: "uno", model: "model.arduino-uno" },
        { id: "btn", model: model },
      ],
      connections: [
        ["uno:D2", "btn:1"],
        ["btn:2", "uno:GND.1"],
      ],
    }),
  );
  if (!built.ok) throw new Error(JSON.stringify(built.issues));
  const sim = createSimulation(registry, built.value);
  sim.dispatch("uno", "capability.gpio", {
    type: "pinMode",
    payload: { pin: 2, mode: "input", pullup: true },
  });
  const d2 = () => sim.voltage("uno:D2");
  const press = () => sim.dispatch("btn", "capability.switching", { type: "press" });
  const release = () => sim.dispatch("btn", "capability.switching", { type: "release" });
  return { sim, d2, press, release };
}

describe("pushbutton on an INPUT_PULLUP pin", () => {
  it("reads HIGH while open and LOW only while pressed", () => {
    const { sim, d2, press, release } = buttonCircuit("model.pushbutton");
    sim.run(0.001);
    expect(d2()).toBeGreaterThan(4.9);
    press();
    expect(d2()).toBeLessThan(0.1);
    release();
    expect(d2()).toBeGreaterThan(4.9);
  });
});

describe("toggle switch", () => {
  it("flips on every press and ignores release", () => {
    const { sim, d2, press, release } = buttonCircuit("model.toggle-switch");
    sim.run(0.001);
    expect(d2()).toBeGreaterThan(4.9);
    press();
    release();
    expect(d2()).toBeLessThan(0.1);
    press();
    expect(d2()).toBeGreaterThan(4.9);
  });
});
