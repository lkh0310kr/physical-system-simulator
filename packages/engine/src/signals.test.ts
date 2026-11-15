import { buildSystem, defineBehavior, loadLibrary, SystemSchema } from "@physisim/core";
import { describe, expect, it } from "vitest";
import { createSimulation } from "./simulation.ts";

/** 시간 t를 `out` 신호로 내보낸다. */
const source = defineBehavior({
  id: "behavior.source",
  init: () => ({}),
  step: (s, _i, ctx) => ({ state: s, outputs: { out: ctx.time } }),
});
/** 받은 `in`을 두 배로 `doubled` 출력. */
const sink = defineBehavior({
  id: "behavior.sink",
  init: () => ({}),
  step: (s, inputs) => ({ state: s, outputs: { doubled: Number(inputs.in ?? -1) * 2 } }),
});

const sig = (name: string, direction: "in" | "out") => ({ name, domain: "signal", direction });
const lib = loadLibrary({
  behaviors: [source, sink],
  capabilities: [
    { id: "capability.source", name: "S", defaultBehavior: "behavior.source" },
    { id: "capability.sink", name: "K", defaultBehavior: "behavior.sink" },
  ],
  models: [
    {
      id: "model.source",
      name: "Source",
      category: "x",
      ports: [sig("out", "out")],
      capabilities: [{ capability: "capability.source" }],
    },
    {
      id: "model.sink",
      name: "Sink",
      category: "x",
      ports: [sig("in", "in")],
      capabilities: [{ capability: "capability.sink" }],
    },
  ],
});
if (!lib.ok) throw new Error(JSON.stringify(lib.issues));
const registry = lib.value;

const build = (doc: unknown) => buildSystem(registry, SystemSchema.parse(doc));

describe("signal lines", () => {
  const doc = {
    name: "s",
    instances: [
      { id: "src", model: "model.source" },
      { id: "snk", model: "model.sink" },
    ],
    connections: [["src:out", "snk:in"]],
  };

  it("routes an output to a connected input with one step of delay", () => {
    const built = build(doc);
    if (!built.ok) throw new Error(JSON.stringify(built.issues));
    const sim = createSimulation(registry, built.value, { dt: 0.001 });
    const seen: [number, number][] = [];
    sim.onStep(({ time, outputs }) =>
      seen.push([time, Number(outputs.get("snk")?.get("capability.sink")?.doubled)]),
    );
    sim.run(0.01);
    // t=0.005의 싱크 입력은 직전 스텝(t=0.004) 소스 출력
    const at = seen.find(([t]) => Math.abs(t - 0.005) < 1e-9);
    expect(at?.[1]).toBeCloseTo(0.008, 9);
  });

  it("an input sees no value until the source has produced its first output", () => {
    const built = build(doc);
    if (!built.ok) throw new Error(JSON.stringify(built.issues));
    const sim = createSimulation(registry, built.value);
    let first: number | undefined;
    sim.onStep(({ outputs }) => {
      first ??= Number(outputs.get("snk")?.get("capability.sink")?.doubled);
    });
    sim.run(0.002);
    // 첫 스텝: 입력 없음 → 싱크가 기본값(−1)×2 = −2를 낸다 (0이 들어오지 않는다)
    expect(first).toBe(-2);
  });

  it("an input with nothing connected sees no value", () => {
    const built = build({ name: "s", instances: [{ id: "snk", model: "model.sink" }] });
    if (!built.ok) throw new Error(JSON.stringify(built.issues));
    const sim = createSimulation(registry, built.value);
    let doubled = 0;
    sim.onStep(({ outputs }) => {
      doubled = Number(outputs.get("snk")?.get("capability.sink")?.doubled);
    });
    sim.run(0.01);
    expect(doubled).toBe(-2);
  });

  it("rejects two outputs on one signal line", () => {
    const built = build({
      name: "s",
      instances: [
        { id: "a", model: "model.source" },
        { id: "b", model: "model.source" },
      ],
      connections: [["a:out", "b:out"]],
    });
    expect(built.ok).toBe(false);
  });

  it("rejects connecting a signal port to an electrical or mechanical port", () => {
    const withElectrical = loadLibrary(
      {
        models: [
          {
            id: "model.pin",
            name: "Pin",
            category: "x",
            ports: [{ name: "p", domain: "electrical" }],
          },
        ],
      },
      registry,
    );
    if (!withElectrical.ok) throw new Error(JSON.stringify(withElectrical.issues));
    const built = buildSystem(
      withElectrical.value,
      SystemSchema.parse({
        name: "s",
        instances: [
          { id: "a", model: "model.source" },
          { id: "b", model: "model.pin" },
        ],
        connections: [["a:out", "b:p"]],
      }),
    );
    expect(built.ok).toBe(false);
  });
});

describe("signal port schema", () => {
  it("requires a direction on signal ports and forbids it elsewhere", () => {
    const a = loadLibrary({
      models: [
        { id: "model.bad", name: "B", category: "x", ports: [{ name: "s", domain: "signal" }] },
      ],
    });
    expect(a.ok).toBe(false);
    const b = loadLibrary({
      models: [
        {
          id: "model.bad2",
          name: "B",
          category: "x",
          ports: [{ name: "s", domain: "electrical", direction: "in" }],
        },
      ],
    });
    expect(b.ok).toBe(false);
  });
});
