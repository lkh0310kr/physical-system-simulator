import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSystem, SystemSchema } from "@physisim/core";
import { createSimulation, recordTrace } from "@physisim/engine";
import { createStandardRegistry } from "@physisim/models";
import { describe, expect, it } from "vitest";
import { loadFirmware } from "./firmware.ts";

const hex = readFileSync(join(import.meta.dirname, "fixtures/blink.hex"), "utf8");
const registry = createStandardRegistry();

function blinkCircuit() {
  const built = buildSystem(
    registry,
    SystemSchema.parse({
      name: "blink",
      instances: [
        { id: "uno", model: "model.arduino-uno" },
        { id: "r1", model: "model.resistor" },
        { id: "led1", model: "model.led" },
      ],
      connections: [
        ["uno:D13", "r1:1"],
        ["r1:2", "led1:A"],
        ["led1:C", "uno:GND.1"],
      ],
    }),
  );
  if (!built.ok) throw new Error(JSON.stringify(built.issues));
  return createSimulation(registry, built.value);
}

describe("loadFirmware (real Arduino Blink build)", () => {
  const sim = blinkCircuit();
  const program = loadFirmware(sim, "uno", hex, { pinCount: 14 });
  const rec = recordTrace(sim);
  const started = performance.now();
  sim.run(1.2);
  const wallMs = performance.now() - started;
  const trace = rec.stop();
  const edges = trace.entries
    .filter((e) => e.signal === "uno.D13")
    .map((e) => [e.time, e.value] as const);

  it("runs without errors", () => {
    expect(program.error).toBeUndefined();
  });

  it("toggles D13 every 500 ms as the sketch says (within the 1 ms slice + Arduino timing)", () => {
    expect(edges.map(([, v]) => v)).toEqual([true, false, true]);
    const times = edges.map(([t]) => t);
    expect(times[0]).toBeLessThan(0.005);
    expect(times[1] ?? 0).toBeCloseTo(0.5, 2);
    expect(times[2] ?? 0).toBeCloseTo(1.0, 2);
  });

  it("drives the LED through the circuit like the JS runtime did", () => {
    const lit = trace.entries.find((e) => e.signal === "led1.brightness" && Number(e.value) > 0);
    expect(lit?.value).toBeCloseTo(3 / 255 / 0.02, 6);
  });

  it("turns USART output into serial lines", () => {
    expect(program.serial.map((l) => l.text)).toEqual(["on", "off", "on"]);
  });

  it("keeps up with real time on this machine", () => {
    // 1.2 s × 16 MHz ≈ 19M 사이클. 정보용 — 너무 느리면 실시간 에디터가 따라가지 못한다.
    expect(wallMs).toBeLessThan(10_000);
  });
});

describe("INPUT_PULLUP", () => {
  const pullupHex = readFileSync(join(import.meta.dirname, "fixtures/pullup.hex"), "utf8");

  function reads(connections: string[][]) {
    const built = buildSystem(
      registry,
      SystemSchema.parse({
        name: "pullup",
        instances: [{ id: "uno", model: "model.arduino-uno" }],
        connections,
      }),
    );
    if (!built.ok) throw new Error(JSON.stringify(built.issues));
    const sim = createSimulation(registry, built.value);
    const program = loadFirmware(sim, "uno", pullupHex, { pinCount: 14 });
    sim.run(0.5);
    return program.serial.map((l) => l.text);
  }

  it("reads HIGH on an unconnected pin, as on a real board", () => {
    expect(new Set(reads([]))).toEqual(new Set(["1"]));
  });

  it("reads LOW when the pin is wired to GND", () => {
    expect(new Set(reads([["uno:D2", "uno:GND.1"]]))).toEqual(new Set(["0"]));
  });
});

describe("loadFirmware errors", () => {
  it("reports a broken HEX file instead of throwing", () => {
    expect(loadFirmware(blinkCircuit(), "uno", ":zz\n").error).toBeInstanceOf(SyntaxError);
  });
});

describe("analogRead with a potentiometer (real firmware)", () => {
  const potHex = readFileSync(join(import.meta.dirname, "fixtures/pot.hex"), "utf8");

  function reading(position: number) {
    const built = buildSystem(
      registry,
      SystemSchema.parse({
        name: "pot",
        instances: [
          { id: "uno", model: "model.arduino-uno" },
          { id: "pot", model: "model.potentiometer", properties: { position } },
        ],
        connections: [
          ["pot:1", "uno:GND.1"],
          ["pot:3", "uno:5V"],
          ["pot:2", "uno:A0"],
        ],
      }),
    );
    if (!built.ok) throw new Error(JSON.stringify(built.issues));
    const sim = createSimulation(registry, built.value);
    const program = loadFirmware(sim, "uno", potHex, { pinCount: 14 });
    sim.run(0.25);
    return program.serial.map((l) => Number(l.text));
  }

  it("follows the wiper position from 0 to 1023, as the 10-bit ADC does", () => {
    // 1023 × position, 소수점 아래는 ADC가 버린다
    expect(new Set(reading(0))).toEqual(new Set([0]));
    expect(new Set(reading(0.5))).toEqual(new Set([511]));
    expect(new Set(reading(1))).toEqual(new Set([1023]));
  });

  it("reads the very first sample correctly (no stale value after boot)", () => {
    expect(reading(0.75)[0]).toBe(767);
  });
});

describe("analogWrite PWM (real firmware, ~490 Hz on D9)", () => {
  /** D9 → 220Ω → LED → GND. 최종 LED 밝기와 D9 상태를 돌려준다. */
  function pwm(file: string) {
    const built = buildSystem(
      registry,
      SystemSchema.parse({
        name: "pwm",
        instances: [
          { id: "uno", model: "model.arduino-uno" },
          { id: "r1", model: "model.resistor" },
          { id: "led1", model: "model.led" },
        ],
        connections: [
          ["uno:D9", "r1:1"],
          ["r1:2", "led1:A"],
          ["led1:C", "uno:GND.1"],
        ],
      }),
    );
    if (!built.ok) throw new Error(JSON.stringify(built.issues));
    const sim = createSimulation(registry, built.value);
    loadFirmware(sim, "uno", readFileSync(join(import.meta.dirname, "fixtures", file), "utf8"), {
      pinCount: 14,
    });
    const rec = recordTrace(sim);
    sim.run(0.2);
    const trace = rec.stop();
    return Number(trace.final["led1.brightness"]);
  }

  const full = 3 / 255 / 0.02; // 항상 켜졌을 때의 밝기

  it("lights the LED in proportion to the duty cycle (average current, not average voltage)", () => {
    expect(pwm("pwm0.hex")).toBe(0);
    expect(pwm("pwm.hex")).toBeCloseTo(full * (64 / 255), 2);
    expect(pwm("pwm128.hex")).toBeCloseTo(full * (128 / 255), 2);
    expect(pwm("pwm255.hex")).toBeCloseTo(full, 6);
  });

  it("does not alias the 490 Hz waveform into alternating on/off", () => {
    const built = buildSystem(
      registry,
      SystemSchema.parse({
        name: "pwm",
        instances: [{ id: "uno", model: "model.arduino-uno" }],
        connections: [],
      }),
    );
    if (!built.ok) throw new Error("fixture");
    const sim = createSimulation(registry, built.value);
    loadFirmware(sim, "uno", readFileSync(join(import.meta.dirname, "fixtures/pwm.hex"), "utf8"), {
      pinCount: 14,
    });
    const rec = recordTrace(sim);
    sim.run(0.2);
    const changes = rec.stop().entries.filter((e) => e.signal === "uno.D9");
    expect(changes.length).toBeLessThan(10); // 안정되면 더 이상 바뀌지 않는다
  });
});
