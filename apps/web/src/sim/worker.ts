/// <reference lib="webworker" />
/**
 * 시뮬레이션 Worker: 엔진을 메인 스레드 밖에서 실시간(벽시계 속도)으로 돌리고 화면용 프레임을 보낸다.
 * MCU 프로그램도 여기서 실행되므로 UI를 멈추게 하지 않는다.
 */
import { type LoadedSystem, loadSystemProject, type PropertyValue } from "@physisim/core";
import { createSimulation, loadProgram, type Program, type Simulation } from "@physisim/engine";
import { createStandardRegistry } from "@physisim/models";
import type { FromWorker, ToWorker } from "./protocol.ts";

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
let signals: Record<string, PropertyValue> = {};
let running = false;
let last = performance.now();

const post = (m: FromWorker) => postMessage(m);

function start() {
  signals = {};
  if (!loaded) {
    sim = undefined;
    programs = [];
    return;
  }
  sim = createSimulation(loaded.registry, loaded.system);
  sim.onStep(({ outputs }) => {
    for (const [instance, byCap] of outputs) {
      for (const out of byCap.values())
        for (const [k, v] of Object.entries(out)) signals[`${instance}.${k}`] = v;
    }
  });
  programs = [...loaded.programs].map(([id, source]) => [
    id,
    loadProgram(sim as Simulation, id, source),
  ]);
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
    } catch (e) {
      running = false;
      post({ type: "error", message: (e as Error).message });
    }
  }
  frame();
}, FRAME_MS);

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  switch (m.type) {
    case "load": {
      const r = loadSystemProject(m.docJson, (path) => m.refs[path], createStandardRegistry);
      loaded = r.ok ? r.value : undefined;
      if (!r.ok) running = false;
      start();
      break;
    }
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
