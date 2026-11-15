/// <reference lib="webworker" />
/**
 * 시뮬레이션 Worker: 엔진을 메인 스레드 밖에서 실시간(벽시계 속도)으로 돌리고 화면용 프레임을 보낸다.
 * MCU 프로그램도 여기서 실행되므로 UI를 멈추게 하지 않는다.
 */

import { startPrograms } from "@physisim/avr";
import { type LoadedSystem, loadSystemProject, type PropertyValue } from "@physisim/core";
import { createSimulation, initPhysics, type Program, type Simulation } from "@physisim/engine";
import { createStandardRegistry } from "@physisim/models";
import { PressQueue } from "./press-queue.ts";
import type { FromWorker, ToWorker } from "./protocol.ts";

// 물리(WASM) 초기화는 비동기다. 최상위 await를 쓰면 모듈 실행이 끝나기 전에 도착한 메시지가 사라질 수 있어서,
// 핸들러는 바로 걸고 초기화가 끝나기를 기다렸다가 도착 순서대로 처리한다.
const physicsInit = initPhysics();

/** 이 전압을 넘으면 선에 "전기가 살아 있다"고 본다. */
const LIVE_VOLTAGE = 0.5;
const FRAME_MS = 33;
/** 탭이 멈췄다 돌아와도 한 프레임에 이만큼만 진행한다 [s]. */
const MAX_STEP = 0.1;
/** 프레임마다 보내는 시리얼 줄 수. */
const SERIAL_LINES = 200;

let loaded: LoadedSystem | undefined;
let sim: Simulation | undefined;
let programs: [string, Program][] = [];
let firmware: ReadonlyMap<string, string> = new Map();
let signals: Record<string, PropertyValue> = {};
let running = false;
const presses = new PressQueue();
let last = performance.now();

const post = (m: FromWorker) => postMessage(m);

function start() {
  signals = {};
  if (!loaded) {
    sim = undefined;
    programs = [];
    return;
  }
  sim = createSimulation(loaded.registry, loaded.system, {
    ...(loaded.doc.assembly ? { assembly: loaded.doc.assembly } : {}),
  });
  sim.onStep(({ outputs }) => {
    for (const [instance, byCap] of outputs) {
      for (const out of byCap.values())
        for (const [k, v] of Object.entries(out)) signals[`${instance}.${k}`] = v;
    }
  });
  programs = startPrograms(sim, loaded, firmware);
  sim.run(0); // t=0 상태
}

function frame() {
  if (!sim || !loaded) return;
  const s = sim;
  const energized = loaded.doc.connections.flatMap(([a], i) =>
    Math.abs(s.voltage(a)) > LIVE_VOLTAGE ? [i] : [],
  );
  const errors = Object.fromEntries(
    programs.flatMap(([id, p]) => (p.error ? [[id, p.error.message]] : [])),
  );
  const serial = Object.fromEntries(programs.map(([id, p]) => [id, p.serial.slice(-SERIAL_LINES)]));
  post({
    type: "frame",
    running,
    time: s.time,
    signals: { ...signals },
    energized,
    errors,
    serial,
  });
}

setInterval(() => {
  const now = performance.now();
  const elapsed = Math.min(MAX_STEP, (now - last) / 1000);
  last = now;
  if (running && sim) {
    try {
      sim.run(elapsed);
      // 빠른 탭도 최소 한 프레임은 눌려 있게: 미뤄 둔 뗌은 시뮬레이션이 진행된 뒤에 전달한다.
      for (const id of presses.tick())
        sim.dispatch(id, "capability.switching", { type: "release" });
    } catch (e) {
      running = false;
      post({ type: "error", message: (e as Error).message });
    }
  }
  frame();
}, FRAME_MS);

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  await physicsInit;
  const m = e.data;
  switch (m.type) {
    case "load": {
      const r = loadSystemProject(m.docJson, (path) => m.refs[path], createStandardRegistry);
      firmware = new Map(Object.entries(m.firmware));
      loaded = r.ok ? r.value : undefined;
      if (!r.ok) running = false;
      start();
      break;
    }
    case "input":
      try {
        if (m.event === "press") presses.press(m.instance);
        if (m.event === "release" && !presses.release(m.instance)) break;
        sim?.dispatch(m.instance, m.capability, { type: m.event });
      } catch (e) {
        post({ type: "error", message: (e as Error).message });
      }
      break;
    case "play":
      running = !!sim;
      last = performance.now();
      break;
    case "pause":
      running = false;
      break;
    case "reset":
      start();
      break;
  }
  frame();
};
