import { describe, expect, it } from "vitest";
import {
  convert,
  formatQuantity,
  parseQuantity,
  parseUnit,
  sameDimension,
  toSI,
  UnitError,
} from "./units.ts";

describe("units", () => {
  it("applies SI prefixes to base units", () => {
    expect(toSI(20, "mA")).toBeCloseTo(0.02);
    expect(toSI(4.7, "kΩ")).toBeCloseTo(4700);
    expect(toSI(16, "MHz")).toBe(16e6);
  });

  it("treats kg as the SI mass unit even though g is the base symbol", () => {
    expect(parseUnit("kg").scale).toBe(1);
  });

  it("distinguishes meter from the milli prefix", () => {
    expect(toSI(1, "m")).toBe(1);
    expect(toSI(1, "mm")).toBe(1e-3);
  });

  it("parses products, quotients and integer powers", () => {
    expect(sameDimension(parseUnit("N*m"), parseUnit("J"))).toBe(true);
    expect(sameDimension(parseUnit("N·m"), parseUnit("kg*m^2/s^2"))).toBe(true);
    expect(sameDimension(parseUnit("V/A"), parseUnit("Ω"))).toBe(true);
  });

  it("converts between units of the same dimension", () => {
    expect(convert(1, "V", "mV")).toBe(1000);
    expect(convert(180, "deg", "rad")).toBeCloseTo(Math.PI);
  });

  it("refuses to convert across dimensions", () => {
    expect(() => convert(1, "V", "A")).toThrow(UnitError);
  });

  it("rejects unknown or malformed units", () => {
    expect(() => parseUnit("furlong")).toThrow(UnitError);
    expect(() => parseUnit("m/s/s")).toThrow(UnitError);
    expect(() => parseUnit("m^1.5")).toThrow(UnitError);
  });

  it("parses quantities written with or without a space", () => {
    expect(parseQuantity("16 MHz").value).toBe(16e6);
    expect(parseQuantity("220Ω").value).toBe(220);
    expect(parseQuantity("3.3V").value).toBeCloseTo(3.3);
    expect(parseQuantity("2").unit.dimension.every((d) => d === 0)).toBe(true);
    expect(() => parseQuantity("V")).toThrow(UnitError);
  });
});

describe("formatQuantity", () => {
  it("picks a metric prefix and keeps three significant digits", () => {
    expect(formatQuantity(3 / 255, "A")).toBe("11.8 mA");
    expect(formatQuantity(4700, "Ω")).toBe("4.7 kΩ");
    expect(formatQuantity(16e6, "Hz")).toBe("16 MHz");
    expect(formatQuantity(0, "A")).toBe("0 A");
    expect(formatQuantity(0.58823, "")).toBe("0.588");
  });
});
