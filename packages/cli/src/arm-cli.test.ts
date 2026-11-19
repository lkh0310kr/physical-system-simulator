import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { armDesignReport, armLines } from "./arm.ts";

describe("physisim arm", () => {
  it("design report recommends 100 mm links and shows every candidate", () => {
    const text = armDesignReport();
    expect(text).toContain("추천: 링크 100/100 mm");
    for (const len of ["90", "100", "110", "120", "130"]) expect(text).toContain(len);
  });

  it("lines turns a script into the Serial lines for the real Uno, keeping WAIT/DWELL as comments", () => {
    const file = join(mkdtempSync(join(tmpdir(), "physisim-arm-")), "s.txt");
    writeFileSync(file, "S 90\nMOVE 0.15 0 0.05\nWAIT\nGRIP CLOSE\nDWELL 0.5\nSTATUS\n");
    const r = armLines(file);
    expect(r.errors).toEqual([]);
    const lines = r.text.split("\n");
    expect(lines[0]).toBe("S 90");
    expect(lines[1]).toMatch(/^J (-?\d+(\.\d+)? ){4}0$/);
    expect(lines.slice(2)).toEqual([
      "# WAIT — STATUS가 MOVING 0을 돌려줄 때까지 기다린다",
      "G CLOSE",
      "# DWELL 0.5",
      "STATUS",
    ]);
  });

  it("lines reports unreachable targets with the line number", () => {
    const file = join(mkdtempSync(join(tmpdir(), "physisim-arm-")), "s.txt");
    writeFileSync(file, "PING\nMOVE 0.9 0 0.05\n");
    expect(armLines(file).errors[0]).toContain("2행");
  });
});
