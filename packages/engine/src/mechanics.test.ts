import { buildSystem, defineBehavior, loadLibrary, numberOf, SystemSchema } from "@physisim/core";
import { describe, expect, it } from "vitest";
import { createSimulation } from "./simulation.ts";

/** 일정 토크를 축에 주는 구동기 (관성·마찰 포함). 각속도를 출력. */
const driver = defineBehavior({
  id: "behavior.driver",
  init: () => ({}),
  mechanics: (_s, ctx) => [
    {
      kind: "rotor",
      id: "r",
      port: "shaft",
      torque: numberOf(ctx.properties, "torque"),
      inertia: numberOf(ctx.properties, "inertia"),
      damping: numberOf(ctx.properties, "damping"),
    },
  ],
  step: (s, _i, ctx) => ({ state: s, outputs: { omega: ctx.mechanical?.omega("shaft") ?? 0 } }),
});

const mech = (name: string) => ({ name, domain: "mechanical" });
const lib = loadLibrary({
  behaviors: [driver],
  capabilities: [{ id: "capability.driver", name: "Driver", defaultBehavior: "behavior.driver" }],
  models: [
    {
      id: "model.driver",
      name: "Driver",
      category: "x",
      propertySchema: {
        torque: { type: "number", default: 0 },
        inertia: { type: "number", default: 0.001 },
        damping: { type: "number", default: 0.01 },
      },
      ports: [mech("shaft")],
      capabilities: [{ capability: "capability.driver" }],
    },
  ],
});
if (!lib.ok) throw new Error(JSON.stringify(lib.issues));
const registry = lib.value;

function simulate(doc: unknown) {
  const built = buildSystem(registry, SystemSchema.parse(doc));
  if (!built.ok) throw new Error(JSON.stringify(built.issues));
  return createSimulation(registry, built.value, { dt: 0.0005 });
}

const omegaAfter = (sim: ReturnType<typeof simulate>, t: number, id: string) => {
  let w = 0;
  sim.onStep(({ outputs }) => {
    w = Number(outputs.get(id)?.get("capability.driver")?.omega ?? 0);
  });
  sim.run(t);
  return w;
};

describe("mechanical nets", () => {
  it("a torque on one shaft accelerates to the steady speed τ/b with time constant J/b", () => {
    const doc = {
      name: "m",
      instances: [{ id: "a", model: "model.driver", properties: { torque: 0.1 } }],
    };
    // J/b = 0.1 s, 정상값 0.1/0.01 = 10 rad/s
    expect(omegaAfter(simulate(doc), 0.1, "a")).toBeCloseTo(10 * (1 - Math.exp(-1)), 0);
    expect(omegaAfter(simulate(doc), 2, "a")).toBeCloseTo(10, 1);
  });

  it("two shafts joined in one mechanical net share a speed: torques add, inertia and friction add", () => {
    const doc = {
      name: "m",
      instances: [
        { id: "a", model: "model.driver", properties: { torque: 0.1 } },
        { id: "b", model: "model.driver", properties: { torque: 0.1 } },
      ],
      connections: [["a:shaft", "b:shaft"]],
    };
    const sim = simulate(doc);
    const w = omegaAfter(sim, 2, "a");
    // (0.1+0.1)/(0.01+0.01) = 10 rad/s — 하나일 때와 같은 속도(토크와 마찰이 같이 두 배)
    expect(w).toBeCloseTo(10, 1);
  });

  it("opposing torques cancel on a shared shaft", () => {
    const doc = {
      name: "m",
      instances: [
        { id: "a", model: "model.driver", properties: { torque: 0.1 } },
        { id: "b", model: "model.driver", properties: { torque: -0.1 } },
      ],
      connections: [["a:shaft", "b:shaft"]],
    };
    expect(Math.abs(omegaAfter(simulate(doc), 1, "a"))).toBeLessThan(1e-9);
  });

  it("an unconnected shaft keeps its own speed separate from other shafts", () => {
    const doc = {
      name: "m",
      instances: [
        { id: "a", model: "model.driver", properties: { torque: 0.1 } },
        { id: "b", model: "model.driver", properties: { torque: 0.05 } },
      ],
    };
    const sim = simulate(doc);
    let wa = 0;
    let wb = 0;
    sim.onStep(({ outputs }) => {
      wa = Number(outputs.get("a")?.get("capability.driver")?.omega);
      wb = Number(outputs.get("b")?.get("capability.driver")?.omega);
    });
    sim.run(2);
    expect(wa).toBeCloseTo(10, 1);
    expect(wb).toBeCloseTo(5, 1);
  });
});
