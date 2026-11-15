import { buildSystem, defineBehavior, loadLibrary, SystemSchema } from "@physisim/core";
import { describe, expect, it } from "vitest";
import { loadProgram } from "./program.ts";
import { createSimulation } from "./simulation.ts";

type Pins = Record<string, { pin: number; mode: string; level: boolean }>;

/** capability.gpio 이벤트 계약만 흉내 내는 최소 GPIO. */
const gpio = defineBehavior<{ pins: Pins }>({
  id: "behavior.fake-gpio",
  init: () => ({ pins: {} }),
  onEvent: (s, e) => {
    const p = e.payload as { pin: number; mode?: string; level?: boolean };
    const prev = s.pins[`P${p.pin}`] ?? { pin: p.pin, mode: "input", level: false };
    const next =
      e.type === "pinMode"
        ? { ...prev, mode: String(p.mode) }
        : { ...prev, level: Boolean(p.level) };
    return { state: { pins: { ...s.pins, [`P${p.pin}`]: next } }, outputs: {} };
  },
  step: (s) => ({
    state: s,
    outputs: Object.fromEntries(Object.entries(s.pins).map(([k, v]) => [k, v.level])),
  }),
});

const lib = loadLibrary({
  behaviors: [gpio],
  capabilities: [{ id: "capability.gpio", name: "GPIO", defaultBehavior: "behavior.fake-gpio" }],
  models: [
    {
      id: "model.mcu",
      name: "MCU",
      category: "x",
      capabilities: [{ capability: "capability.gpio" }],
    },
  ],
});
if (!lib.ok) throw new Error("fixture");
const registry = lib.value;

function setup(source: string) {
  const built = buildSystem(
    registry,
    SystemSchema.parse({ name: "t", instances: [{ id: "mcu", model: "model.mcu" }] }),
  );
  if (!built.ok) throw new Error("fixture");
  const sim = createSimulation(registry, built.value);
  const program = loadProgram(sim, "mcu", source);
  /** P13 레벨이 바뀐 시각 [ms]. */
  const edges: [number, boolean][] = [];
  let prev: boolean | undefined;
  sim.onStep((i) => {
    const level = i.outputs.get("mcu")?.get("capability.gpio")?.P13 as boolean | undefined;
    if (level !== undefined && level !== prev) edges.push([Math.round(i.time * 1000), level]);
    prev = level;
  });
  return { sim, program, edges };
}

const blink = `
export function setup() { pinMode(13, OUTPUT); }
export function* loop() {
  digitalWrite(13, HIGH); yield delay(500);
  digitalWrite(13, LOW);  yield delay(500);
}`;

describe("loadProgram", () => {
  it("runs setup once and loop forever, yielding simulated time at delay", () => {
    const { sim, program, edges } = setup(blink);
    sim.run(2);
    expect(program.error).toBeUndefined();
    expect(edges).toEqual([
      [0, true],
      [500, false],
      [1000, true],
      [1500, false],
      [2000, true],
    ]);
  });

  it("re-invokes a loop without delay at the loop interval and exposes millis", () => {
    const { sim } = setup(`
      let last = -1;
      function setup() { pinMode(13, OUTPUT); }
      function loop() { digitalWrite(13, millis() % 2 === 0 ? HIGH : LOW); }
    `);
    const levels: boolean[] = [];
    sim.onStep((i) => levels.push(Boolean(i.outputs.get("mcu")?.get("capability.gpio")?.P13)));
    sim.run(0.004);
    expect(levels).toEqual([true, false, true, false, true]);
  });

  it("reads back pin levels with digitalRead", () => {
    const { sim, edges } = setup(`
      function setup() { pinMode(13, OUTPUT); digitalWrite(13, HIGH); }
      function* loop() { digitalWrite(13, digitalRead(13) ? LOW : HIGH); yield delay(10); }
    `);
    sim.run(0.03);
    expect(edges.map(([, l]) => l)).toEqual([false, true, false, true]);
  });

  it("stops the program on an error but keeps the simulation running", () => {
    const { sim, program } = setup(`function* loop() { yield delay(5); throw new Error("boom"); }`);
    sim.run(0.02);
    expect(program.error?.message).toBe("boom");
    expect(sim.time).toBeCloseTo(0.02);
  });

  it("collects Serial output line by line with the time each line started", () => {
    const { sim, program } = setup(`
      let n = 0;
      function setup() { Serial.begin(9600); Serial.print("boot"); Serial.println(" ok"); }
      function* loop() { Serial.println("tick " + n++); yield delay(10); }
    `);
    sim.run(0.025);
    expect(program.serial).toEqual([
      { time: 0, text: "boot ok" },
      { time: 0, text: "tick 0" },
      { time: 0.01, text: "tick 1" },
      { time: 0.02, text: "tick 2" },
    ]);
  });

  it("reports syntax errors and yields of anything but delay", () => {
    expect(setup("function loop( {").program.error).toBeInstanceOf(SyntaxError);
    const { sim, program } = setup("function* loop() { yield 5; }");
    sim.run(0.001);
    expect(program.error?.message).toContain("delay");
  });
});
