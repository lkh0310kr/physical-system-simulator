import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseIntelHex } from "./hex.ts";

describe("parseIntelHex", () => {
  it("places data records at their addresses", () => {
    const flash = parseIntelHex(":020004000C945A\n:00000001FF\n", 16);
    expect([...flash.slice(4, 6)]).toEqual([0x0c, 0x94]);
  });

  it("rejects bad checksums", () => {
    expect(() => parseIntelHex(":020004000C9400\n")).toThrow(SyntaxError);
  });

  it("loads a real arduino-cli build", () => {
    const flash = parseIntelHex(
      readFileSync(join(import.meta.dirname, "fixtures/blink.hex"), "utf8"),
    );
    expect(flash[0]).toBe(0x0c); // 리셋 벡터: JMP
  });
});
