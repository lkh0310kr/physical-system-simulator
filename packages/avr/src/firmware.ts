/**
 * 컴파일된 AVR 펌웨어(Intel HEX)를 시뮬레이션 안에서 명령어 단위로 실행한다 (스펙 §9.1, v0.11).
 *
 * - CPU는 `slice`(기본 1ms)마다 시뮬레이션 시각까지 따라잡는다. 핀 변화는 그 구간 끝의 시각으로 반영된다.
 * - 포트 레지스터(DDR/PORT) 변화 → 대상 Instance의 GPIO Behavior에 `pinMode`/`digitalWrite` 이벤트.
 * - 입력 핀 ← 매 구간 전에 GPIO Behavior가 회로에서 읽은 레벨.
 * - USART0 송신 → 시리얼 출력.
 */
import { createSerialLog, type Program, type Simulation } from "@physisim/engine";
import {
  AVRIOPort,
  AVRTimer,
  AVRUSART,
  avrInstruction,
  CPU,
  PinState,
  portBConfig,
  portCConfig,
  portDConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  usart0Config,
} from "avr8js";
import { parseIntelHex } from "./hex.ts";
import { ATMEGA328P_ARDUINO_PINS, type PinMap, type PortName } from "./pins.ts";

export interface FirmwareOptions {
  /** CPU 클럭 [Hz]. 기본 16 MHz (Arduino UNO). */
  readonly clockHz?: number;
  /** CPU를 따라잡게 하는 간격 [s]. 기본 1ms. 핀 변화 시각의 분해능이 된다. */
  readonly slice?: number;
  /** GPIO Capability ID. 기본 `capability.gpio`. */
  readonly capability?: string;
  /** Arduino 핀 번호 → 포트·비트. 기본 ATmega328P(UNO·Nano). */
  readonly pins?: readonly PinMap[];
  /** GPIO가 다루는 핀 수. 이보다 큰 번호의 핀 변화는 무시한다 (보드에 없는 핀). */
  readonly pinCount?: number;
}

type GpioPins = Record<string, { pin: number; mode: string; level: boolean }>;

export function loadFirmware(
  sim: Simulation,
  instance: string,
  hex: string,
  options: FirmwareOptions = {},
): Program {
  const clockHz = options.clockHz ?? 16_000_000;
  const slice = options.slice ?? 0.001;
  const capability = options.capability ?? "capability.gpio";
  const pinMap = (options.pins ?? ATMEGA328P_ARDUINO_PINS).slice(
    0,
    options.pinCount ?? Number.POSITIVE_INFINITY,
  );
  const { lines: serial, write } = createSerialLog(sim);
  let error: Error | undefined;

  let cpu: CPU;
  let ports: Record<PortName, AVRIOPort>;
  try {
    const flash = parseIntelHex(hex);
    cpu = new CPU(new Uint16Array(flash.buffer));
    new AVRTimer(cpu, timer0Config);
    new AVRTimer(cpu, timer1Config);
    new AVRTimer(cpu, timer2Config);
    ports = {
      B: new AVRIOPort(cpu, portBConfig),
      C: new AVRIOPort(cpu, portCConfig),
      D: new AVRIOPort(cpu, portDConfig),
    };
    const usart = new AVRUSART(cpu, usart0Config, clockHz);
    usart.onByteTransmit = (byte) => {
      if (byte !== 13) write(String.fromCharCode(byte)); // "\r\n"의 \r은 버린다
    };
  } catch (e) {
    return { error: e as Error, serial };
  }

  /** 마지막으로 GPIO에 알린 핀 상태. */
  const known = new Map<number, { output: boolean; level: boolean }>();
  const dispatch = (type: string, payload: unknown) => {
    try {
      sim.dispatch(instance, capability, { type, payload });
    } catch (e) {
      error = e as Error;
    }
  };
  const sync = () => {
    pinMap.forEach(({ port, bit }, pin) => {
      const state = ports[port].pinState(bit);
      const output = state === PinState.High || state === PinState.Low;
      const level = state === PinState.High;
      const prev = known.get(pin);
      if (prev?.output !== output) dispatch("pinMode", { pin, mode: output ? "output" : "input" });
      if (output && prev?.level !== level) dispatch("digitalWrite", { pin, level });
      known.set(pin, { output, level });
    });
  };
  for (const p of Object.values(ports)) p.addListener(sync);

  const feedInputs = () => {
    const pins = (sim.state(instance, capability) as { pins?: GpioPins }).pins ?? {};
    for (const p of Object.values(pins)) {
      const map = pinMap[p.pin];
      if (map && p.mode === "input") ports[map.port].setPin(map.bit, p.level);
    }
  };

  const run = () => {
    if (error) return;
    try {
      feedInputs();
      const target = Math.round(sim.time * clockHz);
      while (cpu.cycles < target) {
        avrInstruction(cpu);
        cpu.tick();
      }
    } catch (e) {
      error = e as Error;
      return;
    }
    sim.schedule(sim.time + slice, run);
  };
  sim.schedule(sim.time, run);

  return {
    get error() {
      return error;
    },
    serial,
  };
}
