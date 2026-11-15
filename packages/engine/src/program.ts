/**
 * MCU 프로그램 런타임: Arduino식 API를 쓰는 JS 스크립트를 시뮬레이션 시간 위에서 실행한다 (스펙 §9.1).
 *
 * ```js
 * function setup() { pinMode(13, OUTPUT); }
 * function* loop() {
 *   digitalWrite(13, HIGH); yield delay(500);
 *   digitalWrite(13, LOW);  yield delay(500);
 * }
 * ```
 *
 * - `delay`는 `yield`와 함께 써야 시뮬레이션 시간을 양보한다. 실제로 기다리지 않는다.
 * - `loop`가 `delay` 없이 끝나면 `loopInterval` 뒤에 다시 호출된다 (무한 루프 방지).
 * - GPIO 제어는 대상 Instance의 `capability.gpio` Behavior에 `pinMode`/`digitalWrite` 이벤트로 전달된다.
 * - `Serial.print/println`은 시각과 함께 줄 단위로 `serial`에 쌓인다 (최근 `MAX_SERIAL_LINES`줄).
 * - 스크립트는 같은 프로세스에서 실행된다. 신뢰할 수 없는 코드는 Worker 등으로 격리해서 돌려야 한다.
 */
import type { Simulation } from "./simulation.ts";

export interface ProgramOptions {
  /** GPIO Capability ID. 기본 `capability.gpio`. */
  readonly capability?: string;
  /** `delay` 없이 끝난 `loop`의 재호출 간격 [s]. 기본 1ms. */
  readonly loopInterval?: number;
}

export interface SerialLine {
  /** 줄이 시작된 시각 [s]. */
  readonly time: number;
  readonly text: string;
}

export interface Program {
  /** 프로그램이 던진 오류. 오류가 나면 프로그램은 멈추고 시뮬레이션은 계속된다. */
  readonly error: Error | undefined;
  /** 시리얼 출력 (마지막 줄은 아직 끝나지 않았을 수 있다). */
  readonly serial: readonly SerialLine[];
}

export const MAX_SERIAL_LINES = 1000;

/**
 * 시리얼 출력 기록: 줄바꿈마다 줄을 닫고, 다음 글자가 오면 그 시각으로 새 줄을 연다 (최근 MAX_SERIAL_LINES줄).
 * JS 런타임과 펌웨어 실행기가 함께 쓴다.
 */
export function createSerialLog(clock: { readonly time: number }) {
  const lines: SerialLine[] = [];
  let lineOpen = false;
  const write = (text: string) => {
    const parts = text.split("\n");
    parts.forEach((part, i) => {
      const endsLine = i < parts.length - 1;
      if (!lineOpen && (part || endsLine)) {
        lines.push({ time: clock.time, text: "" });
        if (lines.length > MAX_SERIAL_LINES) lines.shift();
        lineOpen = true;
      }
      const last = lines[lines.length - 1];
      if (last && part) lines[lines.length - 1] = { ...last, text: last.text + part };
      if (endsLine) lineOpen = false;
    });
  };
  return { lines: lines as readonly SerialLine[], write };
}

interface Delay {
  readonly delayMs: number;
}
const isDelay = (v: unknown): v is Delay => typeof (v as Delay | undefined)?.delayMs === "number";

type Entry = (() => unknown) | undefined;

const CONSTANTS = { HIGH: 1, LOW: 0, INPUT: "input", OUTPUT: "output" } as const;

function compile(source: string, api: Record<string, unknown>): { setup: Entry; loop: Entry } {
  const body = `"use strict";\n${source.replace(/^\s*export\s+/gm, "")}\nreturn { setup: typeof setup === "function" ? setup : undefined, loop: typeof loop === "function" ? loop : undefined };`;
  const names = Object.keys(api);
  // 사용자 MCU 프로그램 실행이 이 모듈의 목적이다. API는 전역이 아닌 인자로 주입해 Instance끼리 격리한다.
  const factory = new Function(...names, body) as (...args: unknown[]) => {
    setup: Entry;
    loop: Entry;
  };
  return factory(...names.map((n) => api[n]));
}

const isIterator = (v: unknown): v is Iterator<unknown> =>
  typeof (v as Iterator<unknown> | undefined)?.next === "function";

export function loadProgram(
  sim: Simulation,
  instance: string,
  source: string,
  options: ProgramOptions = {},
): Program {
  const capability = options.capability ?? "capability.gpio";
  const loopInterval = options.loopInterval ?? 0.001;
  let error: Error | undefined;
  const { lines: serial, write } = createSerialLog(sim);

  const pins = () =>
    (sim.state(instance, capability) as { pins?: Record<string, { pin: number; level: boolean }> })
      .pins ?? {};

  const api = {
    ...CONSTANTS,
    pinMode: (pin: number, mode: string) =>
      sim.dispatch(instance, capability, { type: "pinMode", payload: { pin, mode } }),
    digitalWrite: (pin: number, value: unknown) =>
      sim.dispatch(instance, capability, {
        type: "digitalWrite",
        payload: { pin, level: Boolean(value) },
      }),
    digitalRead: (pin: number) => (Object.values(pins()).find((p) => p.pin === pin)?.level ? 1 : 0),
    delay: (ms: number): Delay => ({ delayMs: ms }),
    Serial: {
      begin: (_baud?: number) => {},
      print: (v: unknown) => write(String(v)),
      println: (v: unknown = "") => write(`${String(v)}\n`),
    },
    millis: () => Math.floor(sim.time * 1000),
    micros: () => Math.floor(sim.time * 1_000_000),
  };

  let entries: { setup: Entry; loop: Entry };
  try {
    entries = compile(source, api);
  } catch (e) {
    return { error: e as Error, serial };
  }

  const fail = (e: unknown) => {
    error = e instanceof Error ? e : new Error(String(e));
  };

  /** 함수를 호출하고, 제너레이터면 delay마다 양보하며 끝까지 진행한 뒤 `done`을 부른다. */
  function run(fn: () => unknown, done: (yielded: boolean) => void) {
    let result: unknown;
    try {
      result = fn();
    } catch (e) {
      return fail(e);
    }
    if (!isIterator(result)) return done(false);
    const it = result;
    let yielded = false;
    const resume = () => {
      if (error) return;
      let r: IteratorResult<unknown>;
      try {
        r = it.next();
      } catch (e) {
        return fail(e);
      }
      if (r.done) return done(yielded);
      if (!isDelay(r.value)) return fail(new TypeError("yield에는 delay(ms)만 쓸 수 있다"));
      yielded = true;
      sim.schedule(sim.time + Math.max(0, r.value.delayMs) / 1000, resume);
    };
    resume();
  }

  const { setup, loop } = entries;
  const runLoop = () => {
    if (!loop || error) return;
    run(loop, (yielded) => {
      if (yielded) runLoop();
      else sim.schedule(sim.time + loopInterval, runLoop);
    });
  };
  sim.schedule(sim.time, () => (setup ? run(setup, runLoop) : runLoop()));

  return {
    get error() {
      return error;
    },
    serial,
  };
}
