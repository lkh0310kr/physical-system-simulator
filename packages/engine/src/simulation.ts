/**
 * 시뮬레이션 루프 (스펙 §9.1). 매 스텝:
 *   1. 시각이 된 이벤트 처리  2. 회로 해석  3. Behavior step  4. 구독자에게 알림
 * 파일 I/O·실제 시계·난수를 쓰지 않으므로 같은 입력이면 같은 결과.
 */
import {
  type Behavior,
  type BuiltSystem,
  bodySize,
  type CircuitElement,
  type CircuitReadings,
  type MechanicalReadings,
  type Placement3D,
  placementPosition,
  type Registry,
  type ResolvedValues,
  resolveBehaviorId,
  resolveProperties,
  type Signals,
  type SimEvent,
  splitPortRef,
} from "@physisim/core";
import { createCircuitSolver, type NodeElement } from "./circuit-solver.ts";
import { createScheduler, nextStepTime, toMicros, toSeconds } from "./clock.ts";
import { createPlanarWorld, type PlanarWorld, physicsReady } from "./physics.ts";

/** Instance의 Capability 바인딩 하나 = Behavior 하나의 실행 단위. */
interface Unit {
  readonly instance: string;
  readonly capability: string;
  readonly behavior: Behavior;
  readonly properties: ResolvedValues;
  readonly config: ResolvedValues;
  state: unknown;
  outputs: Signals;
}

export interface StepInfo {
  /** 현재 시각 [s]. */
  readonly time: number;
  /** 스텝 직후 출력. `instance` → `capability` → 출력. */
  readonly outputs: ReadonlyMap<string, ReadonlyMap<string, Signals>>;
}

export interface SimulationOptions {
  /** 고정 스텝 [s]. 기본 1ms. */
  readonly dt?: number;
  /**
   * 3D 조립 배치 (Instance ID → 위치·회전). 주면 물리가 켜진다:
   * `body.collision: "static"` 부품은 장애물 상자가 되고, `drive`를 내놓는 Behavior는 그 위를 달리는 몸체가 된다.
   * 물리 초기화(`await initPhysics()`)가 끝나지 않았으면 물리 없이(Behavior 직접 적분) 돈다.
   */
  readonly assembly?: Readonly<Record<string, Placement3D>>;
}

export interface Simulation {
  /** 현재 시각 [s]. */
  readonly time: number;
  /** 현재 시각 이후 `at`[s]에 실행할 일을 예약한다. */
  schedule(at: number, run: () => void): void;
  /** Behavior의 `onEvent`로 이벤트를 즉시 전달한다. */
  dispatch(instance: string, capability: string, event: SimEvent): void;
  /** 마지막 회로 해석에서 Port(`"instance:port"`)의 전압 [V]. 회로에 없는 Port는 0. */
  voltage(ref: string): number;
  /** Behavior 상태 조회 (읽기 전용으로 다룰 것). */
  state(instance: string, capability: string): unknown;
  /** 매 스텝 후 호출될 구독자. 해제 함수를 돌려준다. */
  onStep(listener: (info: StepInfo) => void): () => void;
  /** `duration`[s]만큼 진행한다. */
  run(duration: number): void;
}

export function createSimulation(
  registry: Registry,
  system: BuiltSystem,
  options: SimulationOptions = {},
): Simulation {
  const dt = toMicros(options.dt ?? 0.001);
  if (dt <= 0) throw new RangeError("dt는 0보다 커야 한다");

  // ── 실행 단위 ──────────────────────────────────────────────
  const units: Unit[] = [];
  for (const inst of system.instances) {
    const model = registry.getModel(inst.model);
    for (const binding of model?.capabilities ?? []) {
      const capability = registry.getCapability(binding.capability);
      const behaviorId = capability && resolveBehaviorId(binding, capability);
      const behavior = behaviorId ? registry.getBehavior(behaviorId) : undefined;
      const config = capability && resolveProperties(capability.parameters, binding.config);
      if (!behavior || !config?.ok)
        throw new Error(`${inst.id}: ${binding.capability} 해석 실패 (Registry 검증 필요)`);
      units.push({
        instance: inst.id,
        capability: binding.capability,
        behavior,
        properties: inst.properties,
        config: config.value,
        state: inst.state[binding.capability],
        outputs: {},
      });
    }
  }
  // ── 물리 (선택) ────────────────────────────────────────────
  const rad = (d: number) => (d * Math.PI) / 180;
  const physicsBodies: { unit: Unit; handle: number; origin: readonly [number, number] }[] = [];
  let planarWorld: PlanarWorld | undefined;
  if (options.assembly && physicsReady() && units.some((u) => u.behavior.drive)) {
    const assembly = options.assembly;
    const statics = system.instances.flatMap((inst) => {
      const body = registry.getModel(inst.model)?.body;
      const placed = assembly[inst.id];
      if (!body || body.collision !== "static" || !placed) return [];
      return [
        {
          position: placementPosition(placed),
          size: bodySize(body),
          rotationZ: rad(Number(placed.rotation?.[2] ?? 0)),
        },
      ];
    });
    planarWorld = createPlanarWorld(statics);
    for (const u of units) {
      if (!u.behavior.drive) continue;
      const model = registry.getModel(
        system.instances.find((i) => i.id === u.instance)?.model ?? "",
      );
      const placed = assembly[u.instance];
      if (!model?.body || !placed) continue;
      const position = placementPosition(placed);
      const handle = planarWorld.addBody({
        position,
        size: bodySize(model.body),
        rotationZ: rad(Number(placed.rotation?.[2] ?? 0)),
        mass: (model.body.mass ?? 1000) / 1000,
      });
      physicsBodies.push({ unit: u, handle, origin: [position[0], position[1]] });
    }
  }

  const unitOf = (instance: string, capability: string) => {
    const u = units.find((x) => x.instance === instance && x.capability === capability);
    if (!u) throw new Error(`실행 단위 없음: ${instance} / ${capability}`);
    return u;
  };

  // ── Port → 회로 노드 (0 = 접지) ─────────────────────────────
  const isGround = (ref: string) => {
    const { instance, port } = splitPortRef(ref);
    const model = registry.getModel(system.instances.find((i) => i.id === instance)?.model ?? "");
    return model?.ports.find((p) => p.name === port)?.ground === true;
  };
  const nodeOf = new Map<string, number>();
  let nodeCount = 1;
  for (const net of system.nets) {
    if (net.domain !== "electrical") continue;
    const node = net.ports.some(isGround) ? 0 : nodeCount++;
    for (const ref of net.ports) nodeOf.set(ref, node);
  }
  /** 연결되지 않은 Port는 자기만의 노드를 갖는다 (접지 Port는 0). */
  const node = (ref: string): number => {
    let n = nodeOf.get(ref);
    if (n === undefined) {
      n = isGround(ref) ? 0 : nodeCount++;
      nodeOf.set(ref, n);
    }
    return n;
  };

  // ── 기계 Net (축 각속도 공유) ───────────────────────────────
  const mechNetOf = new Map<string, number>();
  let mechNetCount = 0;
  for (const net of system.nets) {
    if (net.domain !== "mechanical") continue;
    for (const ref of net.ports) mechNetOf.set(ref, mechNetCount);
    mechNetCount++;
  }
  /** 연결되지 않은 기계 Port는 자기만의 Net을 갖는다 (모터 축만 달랑 있는 경우). */
  const mechNode = (ref: string): number => {
    let n = mechNetOf.get(ref);
    if (n === undefined) {
      n = mechNetCount++;
      mechNetOf.set(ref, n);
    }
    return n;
  };
  // 연결되지 않은 기계 Port도 미리 Net을 만든다 — 회전체 기여만 하고 회로는 없는 Behavior(차체 등)도 풀리게
  for (const inst of system.instances) {
    const model = registry.getModel(inst.model);
    for (const port of model?.ports ?? []) {
      if (port.domain === "mechanical") mechNode(`${inst.id}:${port.name}`);
    }
  }
  const omegas: number[] = [];
  const mechanicalFor = (u: Unit): MechanicalReadings => ({
    omega: (port) => omegas[mechNode(`${u.instance}:${port}`)] ?? 0,
  });

  const NO_INPUTS: Signals = Object.freeze({});

  // ── 신호 선 (출력 → 입력, 한 스텝 지연) ─────────────────────
  /** 입력 Port 참조 → 그 선의 출력 Port 참조. */
  const signalSource = new Map<string, string>();
  const portDirection = (ref: string) => {
    const { instance, port } = splitPortRef(ref);
    const model = registry.getModel(system.instances.find((i) => i.id === instance)?.model ?? "");
    return model?.ports.find((p) => p.name === port)?.direction;
  };
  for (const net of system.nets) {
    if (net.domain !== "signal") continue;
    const out = net.ports.find((r) => portDirection(r) === "out");
    if (!out) continue;
    for (const ref of net.ports) if (portDirection(ref) === "in") signalSource.set(ref, out);
  }
  /**
   * 입력 연결을 만들 때 한 번 풀어 둔다: 입력을 받는 단위마다 [입력 이름, 출력을 내는 단위들, 출력 이름].
   * 스텝마다 문자열을 다시 쪼개거나 모든 단위를 훑지 않는다.
   */
  const inputLinks = new Map<Unit, { name: string; sources: Unit[]; outName: string }[]>();
  for (const [inRef, outRef] of signalSource) {
    const to = splitPortRef(inRef);
    const from = splitPortRef(outRef);
    const sources = units.filter((x) => x.instance === from.instance);
    for (const u of units.filter((x) => x.instance === to.instance)) {
      const list = inputLinks.get(u) ?? [];
      list.push({ name: to.port, sources, outName: from.port });
      inputLinks.set(u, list);
    }
  }
  /** 스텝 시작 시점의 출력으로 입력을 만든다 — Behavior 실행 순서와 무관하게 정확히 한 스텝 지연. */
  const inputsOf = (previous: ReadonlyMap<Unit, Signals>, u: Unit): Signals => {
    const links = inputLinks.get(u);
    if (!links) return NO_INPUTS;
    const inputs: Signals = {};
    for (const link of links) {
      for (const source of link.sources) {
        const out = previous.get(source);
        // 출력이 아직 한 번도 나오지 않았다 (첫 스텝) — 값이 없는 것으로 둔다
        if (out && link.outName in out) {
          inputs[link.name] = out[link.outName] as Signals[string];
          break;
        }
      }
    }
    return inputs;
  };

  // ── 회로 해석 ─────────────────────────────────────────────
  const solver = createCircuitSolver();
  let voltages: readonly number[] = [0];
  let currents: ReadonlyMap<string, number> = new Map();
  const elementKey = (u: Unit, id: string) => `${u.instance}/${u.capability}/${id}`;
  const readingsFor = (u: Unit): CircuitReadings => ({
    voltage: (port) => voltages[node(`${u.instance}:${port}`)] ?? 0,
    current: (id) => currents.get(elementKey(u, id)) ?? 0,
  });

  function toNodeElement(u: Unit, e: CircuitElement): NodeElement {
    const n = (port: string) => node(`${u.instance}:${port}`);
    const id = elementKey(u, e.id);
    switch (e.kind) {
      case "resistor":
        return { ...e, id, a: n(e.a), b: n(e.b) };
      case "drive":
        return { kind: "drive", id, node: n(e.port), voltage: e.voltage, resistance: e.resistance };
      case "load":
        return { kind: "load", id, node: n(e.port), current: e.current };
      case "source":
        return { kind: "source", id, a: n(e.a), b: n(e.b), current: e.current };
      case "diode":
        return { ...e, id, anode: n(e.anode), cathode: n(e.cathode) };
    }
  }

  /** PWM 구동원이 있을 때 한 주기를 이 개수의 위상으로 나눠 풀고 평균한다 (듀티 분해능 1/16). */
  const PWM_PHASES = 16;

  function solveCircuit() {
    const raw = units.flatMap((u) =>
      (
        u.behavior.circuit?.(u.state, {
          properties: u.properties,
          config: u.config,
          mechanical: mechanicalFor(u),
        }) ?? []
      ).map((e) => ({ u, e })),
    );
    if (raw.length === 0) return;
    const pwm = raw.some(
      ({ e }) => e.kind === "drive" && e.duty !== undefined && e.duty > 0 && e.duty < 1,
    );
    const phases = pwm ? PWM_PHASES : 1;
    let sumV: number[] | undefined;
    const sumI = new Map<string, number>();
    for (let k = 0; k < phases; k++) {
      const phase = (k + 0.5) / phases;
      const elements = raw.map(({ u, e }) =>
        toNodeElement(
          u,
          e.kind === "drive" && e.duty !== undefined
            ? { ...e, voltage: phase < e.duty ? e.voltage : 0 }
            : e,
        ),
      );
      const solution = solver.solve(nodeCount, elements);
      sumV = (sumV ?? solution.voltages.map(() => 0)).map(
        (v, i) => v + (solution.voltages[i] ?? 0),
      );
      for (const [id, i] of solution.currents) sumI.set(id, (sumI.get(id) ?? 0) + i);
    }
    voltages = (sumV ?? [0]).map((v) => v / phases);
    currents = new Map([...sumI].map(([id, i]) => [id, i / phases]));
  }

  /**
   * 기계 Net마다 (ΣJ)·dω/dt = Στ − (Σb)·ω 를 암시적(후진 오일러)으로 푼다.
   * 관성이 0뿐이면(마찰만 있는 Net) ω는 토크/마찰의 정상값이다.
   */
  function solveMechanics(stepDt: number) {
    if (mechNetCount === 0) return;
    const dtSeconds = toSeconds(stepDt);
    const J: number[] = Array(mechNetCount).fill(0);
    const B: number[] = Array(mechNetCount).fill(0);
    const T: number[] = Array(mechNetCount).fill(0);
    for (const u of units) {
      const elements = u.behavior.mechanics?.(u.state, ctxOf(u, stepDt)) ?? [];
      for (const e of elements) {
        const n = mechNode(`${u.instance}:${e.port}`);
        J[n] = (J[n] ?? 0) + e.inertia;
        B[n] = (B[n] ?? 0) + e.damping;
        T[n] = (T[n] ?? 0) + e.torque;
      }
    }
    for (let n = 0; n < mechNetCount; n++) {
      const j = J[n] ?? 0;
      const b = B[n] ?? 0;
      const t = T[n] ?? 0;
      const w = omegas[n] ?? 0;
      const denom = j + dtSeconds * b;
      omegas[n] = denom > 0 ? (j * w + dtSeconds * t) / denom : 0;
    }
  }

  // ── 루프 ─────────────────────────────────────────────────
  const scheduler = createScheduler<() => void>();
  const listeners = new Set<(info: StepInfo) => void>();
  let now = 0;
  let last = 0;

  const ctxOf = (u: Unit, stepDt: number) => ({
    properties: u.properties,
    config: u.config,
    time: toSeconds(now),
    dt: toSeconds(stepDt),
    circuit: readingsFor(u),
    mechanical: mechanicalFor(u),
  });

  function step() {
    for (const run of scheduler.popDue(now)) run();
    solveCircuit();
    const stepDt = now - last;
    solveMechanics(stepDt);
    const previous = new Map(units.map((u) => [u, u.outputs] as const));
    for (const u of units) {
      // 신호 선으로 이어진 입력은 직전 스텝의 출력을 받는다 (한 스텝 지연). 물리량은 ctx.circuit·ctx.mechanical.
      const r = u.behavior.step(u.state, inputsOf(previous, u), ctxOf(u, stepDt));
      u.state = r.state;
      u.outputs = r.outputs;
    }
    if (planarWorld && physicsBodies.length > 0 && stepDt > 0) {
      const commands = new Map<number, { speed: number; yawRate: number }>();
      for (const b of physicsBodies) {
        const c = b.unit.behavior.drive?.(b.unit.state, ctxOf(b.unit, stepDt));
        if (c) commands.set(b.handle, c);
      }
      planarWorld.step(toSeconds(stepDt), commands);
      for (const b of physicsBodies) {
        const world = planarWorld.pose(b.handle);
        const pose = { x: world.x - b.origin[0], y: world.y - b.origin[1], heading: world.heading };
        const r = b.unit.behavior.onPose?.(b.unit.state, b.unit.outputs, pose);
        if (r) {
          b.unit.state = r.state;
          b.unit.outputs = r.outputs;
        }
      }
    }
    last = now;
    if (listeners.size) {
      const outputs = new Map<string, Map<string, Signals>>();
      for (const u of units) {
        const byCap = outputs.get(u.instance) ?? new Map<string, Signals>();
        byCap.set(u.capability, u.outputs);
        outputs.set(u.instance, byCap);
      }
      for (const l of listeners) l({ time: toSeconds(now), outputs });
    }
  }

  let started = false;
  return {
    get time() {
      return toSeconds(now);
    },
    schedule(at, run) {
      scheduler.schedule(Math.max(toMicros(at), now), run);
    },
    dispatch(instance, capability, event) {
      const u = unitOf(instance, capability);
      const r = u.behavior.onEvent?.(u.state, event, ctxOf(u, 0));
      if (r) {
        u.state = r.state;
        u.outputs = r.outputs;
        // 상태가 바뀌었으니 회로도 바로 최신으로: 풀업을 켠 직후의 읽기가 다음 스텝을 기다리지 않는다.
        solveCircuit();
      }
    },
    voltage: (ref) => voltages[nodeOf.get(ref) ?? 0] ?? 0,
    state: (instance, capability) => unitOf(instance, capability).state,
    onStep(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    run(duration) {
      const end = now + toMicros(duration);
      if (!started) {
        started = true;
        step(); // t = 0 상태
      }
      while (now < end) {
        now = nextStepTime(now, dt, end, scheduler.nextTime());
        step();
      }
    },
  };
}
