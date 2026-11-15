import { describe, expect, it } from "vitest";
import { parseRails } from "./index.ts";

describe("parseRails", () => {
  it("parses Port=voltage pairs separated by commas", () => {
    expect(parseRails("5V=5, 3.3V=3.3")).toEqual([
      { port: "5V", voltage: 5 },
      { port: "3.3V", voltage: 3.3 },
    ]);
    expect(parseRails("")).toEqual([]);
  });

  it("rejects malformed rails instead of silently dropping them", () => {
    expect(() => parseRails("5V")).toThrow(RangeError);
    expect(() => parseRails("5V=abc")).toThrow(RangeError);
    expect(() => parseRails("5V=5=6")).toThrow(RangeError);
  });
});
