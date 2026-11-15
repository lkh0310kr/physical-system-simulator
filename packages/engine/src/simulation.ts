/**
 * 시뮬레이션 루프 (스펙 §9.1). 매 스텝:
 *   1. 시각이 된 이벤트 처리  2. 회로 해석  3. Behavior step  4. 구독자에게 알림
 * 파일 I/O·실제 시계·난수를 쓰지 않으므로 같은 입력이면 같은 결과.
 */
import {
  type Behavior,
  type BuiltSystem,
  type CircuitElement,
  type CircuitReadings,
  type MechanicalReadings,
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
  const omegas: number[] = [];
  const mechanicalFor = (u: Unit): MechanicalReadings => ({
    omega: (port) => omegas[mechNode(`${u.instance}:${port}`)] ?? 0,
  });

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
  /** 출력 Port 참조가 가리키는 Instance의 직전 스텝 출력 값 (출력 이름 = Port 이름). */
  const signalValue = (previous: ReadonlyMap<Unit, Signals>, outRef: string) => {
    const { instance, port } = splitPortRef(outRef);
    for (const u of units) {
      const out = previous.get(u);
      if (u.instance === instance && out && port in out) return out[port];
    }
    // 출력이 아직 한 번도 나오지 않았다 (첫 스텝) — 값이 없는 것으로 둔다
    return undefined;
  };
  /** 스텝 시작 시점의 출력으로 입력을 만든다 — Behavior 실행 순서와 무관하게 정확히 한 스텝 지연. */
  const inputsOf = (previous: ReadonlyMap<Unit, Signals>, u: Unit): Signals => {
    const inputs: Signals = {};
    for (const [inRef, outRef] of signalSource) {
      const { instance, port } = splitPortRef(inRef);
      const value = instance === u.instance ? signalValue(previous, outRef) : undefined;
      if (value !== undefined) inputs[port] = value;
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
