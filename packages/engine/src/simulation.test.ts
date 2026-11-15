import { buildSystem, defineBehavior, loadLibrary, numberOf, SystemSchema } from "@physisim/core";
import { describe, expect, it } from "vitest";
import { createSimulation } from "./simulation.ts";

/** 시간을 적분하는 Behavior. */
const timer = defineBehavior<{ elapsed: number }>({
  id: "behavior.timer",
  init: () => ({ elapsed: 0 }),
  step: (s, _in, ctx) => ({
    state: { elapsed: s.elapsed + ctx.dt },
    outputs: { elapsed: s.elapsed + ctx.dt },
  }),
});

/** 켜면 "+" 단자를 전압으로 구동하는 전원. */
const supply = defineBehavior<{ on: boolean }>({
  id: "behavior.supply",
  init: () => ({ on: false }),
  circuit: (s, ctx) => [
    {
      kind: "drive",
      id: "out",
      port: "+",
      voltage: s.on ? numberOf(ctx.properties, "voltage") : 0,
      resistance: 1e-3,
    },
  ],
  step: (s) => ({ state: s, outputs: { on: s.on } }),
  onEvent: (s, e) => ({
    state: { on: e.type === "on" ? true : e.type === "off" ? false : s.on },
    outputs: {},
  }),
});

/** 저항 부하. 흐르는 전류를 출력. */
const load = defineBehavior({
  id: "behavior.load",
  init: () => ({}),
  circuit: (_s, ctx) => [
    {
      kind: "resistor",
      id: "r",
      a: "1",
      b: "2",
      resistance: numberOf(ctx.properties, "resistance"),
    },
  ],
  step: (s, _in, ctx) => ({
    state: s,
    outputs: { current: ctx.circuit?.current("r") ?? 0, v1: ctx.circuit?.voltage("1") ?? 0 },
  }),
});

const e = (name: string, ground = false) => ({
  name,
  domain: "electrical",
  ...(ground ? { ground } : {}),
});
const lib = loadLibrary({
  behaviors: [timer, supply, load],
  capabilities: [
    { id: "capability.timer", name: "Timer", defaultBehavior: "behavior.timer" },
    { id: "capability.supply", name: "Supply", defaultBehavior: "behavior.supply" },
    { id: "capability.load", name: "Load", defaultBehavior: "behavior.load" },
  ],
  models: [
    {
      id: "model.clock",
      name: "Clock",
      category: "x",
      capabilities: [{ capability: "capability.timer" }],
    },
    {
      id: "model.battery",
      name: "Battery",
      category: "x",
      propertySchema: { voltage: { type: "number", unit: "V" } },
      properties: { voltage: 6 },
      ports: [e("+"), e("-", true)],
      capabilities: [{ capability: "capability.supply" }],
    },
    {
      id: "model.resistor",
      name: "R",
      category: "x",
      propertySchema: { resistance: { type: "number", unit: "Ω" } },
      properties: { resistance: 100 },
      ports: [e("1"), e("2")],
      capabilities: [{ capability: "capability.load" }],
    },
  ],
});
if (!lib.ok) throw new Error(JSON.stringify(lib.issues));
const registry = lib.value;

function simulate(doc: unknown) {
  const built = buildSystem(registry, SystemSchema.parse(doc));
  if (!built.ok) throw new Error(JSON.stringify(built.issues));
  return createSimulation(registry, built.value);
}

const circuit = {
  name: "battery + two resistors",
  instances: [
    { id: "bat", model: "model.battery" },
    { id: "r1", model: "model.resistor" },
    { id: "r2", model: "model.resistor", properties: { resistance: 200 } },
  ],
  connections: [
    ["bat:+", "r1:1"],
    ["r1:2", "r2:1"],
    ["r2:2", "bat:-"],
  ],
};

describe("createSimulation", () => {
  it("advances time in fixed steps and integrates behavior state", () => {
    const sim = simulate({ name: "t", instances: [{ id: "c", model: "model.clock" }] });
    let steps = 0;
    sim.onStep(() => steps++);
    sim.run(0.01);
    expect(sim.time).toBeCloseTo(0.01);
    expect(steps).toBe(11); // t=0 + 10 × 1ms
    expect((sim.state("c", "capability.timer") as { elapsed: number }).elapsed).toBeCloseTo(0.01);
  });

  it("runs scheduled work at its exact time, even between fixed steps", () => {
    const sim = simulate({ name: "t", instances: [{ id: "c", model: "model.clock" }] });
    const seen: number[] = [];
    sim.schedule(0.0025, () => seen.push(sim.time));
    sim.run(0.005);
    expect(seen).toEqual([0.0025]);
  });

  it("solves the circuit from behavior contributions over the system's nets", () => {
    const sim = simulate(circuit);
    sim.dispatch("bat", "capability.supply", { type: "on" });
    let last: Map<string, unknown> | undefined;
    sim.onStep((i) => {
      last = new Map([["r1", i.outputs.get("r1")?.get("capability.load")]]);
    });
    sim.run(0.001);
    expect(last?.get("r1")).toMatchObject({
      current: expect.closeTo(6 / 300, 6),
      v1: expect.closeTo(6, 3),
    });
  });

  it("changes circuit results when an event changes behavior state", () => {
    const sim = simulate(circuit);
    const currents: number[] = [];
    sim.onStep((i) => currents.push(Number(i.outputs.get("r2")?.get("capability.load")?.current)));
    sim.schedule(0.002, () => sim.dispatch("bat", "capability.supply", { type: "on" }));
    sim.run(0.003);
    expect(currents.map((c) => Math.round(c * 1000))).toEqual([0, 0, 20, 20]);
  });

  it("re-solves the circuit as soon as an event changes behavior state", () => {
    const sim = simulate(circuit);
    sim.run(0.001);
    expect(sim.voltage("r2:1")).toBe(0);
    sim.dispatch("bat", "capability.supply", { type: "on" });
    // 다음 스텝을 기다리지 않고 바로 반영된다 (풀업을 켠 직후에 읽는 펌웨어를 위해).
    expect(sim.voltage("r2:1")).toBeCloseTo(4, 3);
  });

  it("exposes port voltages from the last circuit solve", () => {
    const sim = simulate(circuit);
    sim.dispatch("bat", "capability.supply", { type: "on" });
    sim.run(0.001);
    expect(sim.voltage("bat:+")).toBeCloseTo(6, 3);
    expect(sim.voltage("r2:1")).toBeCloseTo(4, 3); // 6V × 200/300
    expect(sim.voltage("bat:-")).toBe(0);
    expect(sim.voltage("nobody:x")).toBe(0);
  });

  it("is deterministic", () => {
    const trace = () => {
      const sim = simulate(circuit);
      const out: string[] = [];
      sim.onStep((i) => out.push(JSON.stringify([...(i.outputs.get("r1") ?? [])])));
      sim.schedule(0.0013, () => sim.dispatch("bat", "capability.supply", { type: "on" }));
      sim.run(0.005);
      return out.join("|");
    };
    expect(trace()).toBe(trace());
  });
});

describe("PWM drive (duty)", () => {
  const pwmSupply = defineBehavior<{ duty: number }>({
    id: "behavior.pwm-supply",
    init: () => ({ duty: 0.25 }),
    circuit: (s) => [
      { kind: "drive", id: "out", port: "+", voltage: 6, resistance: 1e-3, duty: s.duty },
    ],
    step: (s) => ({ state: s, outputs: {} }),
  });
  const lib2 = loadLibrary({
    behaviors: [pwmSupply, load],
    capabilities: [
      { id: "capability.pwm", name: "PWM", defaultBehavior: "behavior.pwm-supply" },
      { id: "capability.load", name: "Load", defaultBehavior: "behavior.load" },
    ],
    models: [
      {
        id: "model.pwm",
        name: "PWM",
        category: "x",
        ports: [e("+"), e("-", true)],
        capabilities: [{ capability: "capability.pwm" }],
      },
      {
        id: "model.resistor",
        name: "R",
        category: "x",
        propertySchema: { resistance: { type: "number", unit: "Ω" } },
        properties: { resistance: 100 },
        ports: [e("1"), e("2")],
        capabilities: [{ capability: "capability.load" }],
      },
    ],
  });
  if (!lib2.ok) throw new Error("fixture");

  it("averages a resistive load to duty × voltage", () => {
    const built = buildSystem(
      lib2.value,
      SystemSchema.parse({
        name: "t",
        instances: [
          { id: "p", model: "model.pwm" },
          { id: "r", model: "model.resistor" },
        ],
        connections: [
          ["p:+", "r:1"],
          ["r:2", "p:-"],
        ],
      }),
    );
    if (!built.ok) throw new Error("fixture");
    const sim = createSimulation(lib2.value, built.value);
    sim.run(0.001);
    expect(sim.voltage("r:1")).toBeCloseTo(6 * 0.25, 1);
  });
});
