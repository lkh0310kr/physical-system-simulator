import { describe, expect, it } from "vitest";
import {
  createStandardRegistry,
  type DigitalIoEvent,
  type DigitalIoState,
  digitalIo,
  ledBehavior,
} from "./index.ts";

describe("standard library", () => {
  const registry = createStandardRegistry();

  it("loads every definition without issues", () => {
    expect(registry.models().map((m) => m.id)).toEqual([
      "model.led",
      "model.esp32-s3-camera-node",
      "model.li-ion-cell",
      "model.resistor",
      "model.pushbutton",
      "model.toggle-switch",
      "model.potentiometer",
      "model.atmega328p",
      "model.arduino-uno",
    ]);
  });

  it("builds Arduino UNO from an ATmega328P component and shares the GPIO capability", () => {
    const uno = registry.getModel("model.arduino-uno");
    expect(uno?.components).toEqual([{ name: "mcu", model: "model.atmega328p" }]);
    expect(uno?.capabilities[0]?.capability).toBe("capability.gpio");
    expect(registry.getModel("model.atmega328p")?.capabilities[0]?.capability).toBe(
      "capability.gpio",
    );
  });
});

describe("behavior.digital-io", () => {
  const config = {
    pinCount: 20,
    logicLevel: 5,
    pinPrefix: "D",
    outputResistance: 25,
    pullupResistance: 20000,
  };
  const ctx = (voltage = 0) => ({
    time: 0,
    dt: 0.001,
    properties: {},
    config,
    circuit: { voltage: () => voltage, current: () => 0 },
  });
  const send = (state: DigitalIoState, event: DigitalIoEvent) =>
    digitalIo.onEvent?.(state, event, ctx()).state as DigitalIoState;
  const output13 = send(
    send({ pins: {} }, { type: "pinMode", payload: { pin: 13, mode: "output" } }),
    {
      type: "digitalWrite",
      payload: { pin: 13, level: true },
    },
  );

  it("maps pin numbers to ports with the configured prefix", () => {
    expect(output13.pins).toEqual({
      D13: { pin: 13, mode: "output", level: true, pullup: false },
    });
  });

  it("drives output pins at the logic level through the output resistance", () => {
    expect(digitalIo.circuit?.(output13, ctx())).toEqual([
      { kind: "drive", id: "D13", port: "D13", voltage: 5, resistance: 25 },
    ]);
  });

  it("reads input pins as HIGH above half the logic level", () => {
    const input = send({ pins: {} }, { type: "pinMode", payload: { pin: 2, mode: "input" } });
    expect(digitalIo.step(input, {}, ctx(3)).outputs).toEqual({ D2: true });
    expect(digitalIo.step(input, {}, ctx(2)).outputs).toEqual({ D2: false });
  });

  it("pulls an input pin up to the logic level only when the pull-up is enabled", () => {
    const withPullup = send(
      { pins: {} },
      { type: "pinMode", payload: { pin: 2, mode: "input", pullup: true } },
    );
    expect(digitalIo.circuit?.(withPullup, ctx())).toEqual([
      { kind: "drive", id: "D2.pullup", port: "D2", voltage: 5, resistance: 20000 },
    ]);
    const plain = send({ pins: {} }, { type: "pinMode", payload: { pin: 2, mode: "input" } });
    expect(digitalIo.circuit?.(plain, ctx())).toEqual([]);
  });

  it("drops the pull-up when the pin becomes an output", () => {
    const pulled = send(
      { pins: {} },
      { type: "pinMode", payload: { pin: 2, mode: "input", pullup: true } },
    );
    const out = send(pulled, { type: "pinMode", payload: { pin: 2, mode: "output" } });
    expect(digitalIo.circuit?.(out, ctx())?.map((e) => e.id)).toEqual(["D2"]);
  });

  it("rejects pins outside the board", () => {
    expect(() =>
      send({ pins: {} }, { type: "pinMode", payload: { pin: 20, mode: "output" } }),
    ).toThrow(RangeError);
  });
});

describe("behavior.led", () => {
  const properties = { forwardVoltage: 2, maxCurrent: 0.02, dynamicResistance: 10 };
  const brightness = (current: number) =>
    ledBehavior.step(
      {},
      {},
      {
        time: 0,
        dt: 0.001,
        config: {},
        properties,
        circuit: { voltage: () => 0, current: () => current },
      },
    ).outputs.brightness;

  it("contributes a diode from A to C", () => {
    expect(ledBehavior.circuit?.({}, { properties, config: {} })).toEqual([
      { kind: "diode", id: "diode", anode: "A", cathode: "C", forwardVoltage: 2, onResistance: 10 },
    ]);
  });

  it("scales brightness with forward current up to the maximum", () => {
    expect(brightness(0.01)).toBeCloseTo(0.5);
    expect(brightness(0.05)).toBe(1);
    expect(brightness(-0.01)).toBe(0);
  });
});

describe("Arduino UNO GPIO", () => {
  it("has a port for every digital pin the GPIO capability exposes", () => {
    const registry = createStandardRegistry();
    const uno = registry.getModel("model.arduino-uno");
    const count = Number(uno?.capabilities[0]?.config.pinCount);
    const ports = new Set(uno?.ports.map((p) => p.name));
    for (let pin = 0; pin < count; pin++) expect(ports.has(`D${pin}`), `D${pin}`).toBe(true);
  });
});
