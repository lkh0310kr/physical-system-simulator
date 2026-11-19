import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { compileSketch } from "@physisim/avr/compile";
import { GRIPPER_CLOSED_DEG, LIMITS_DEG } from "@physisim/models";
import { describe, expect, it } from "vitest";

const source = readFileSync("examples/robot-arm-firmware/robot-arm-firmware.ino", "utf8");
const hasArduinoCli = (() => {
  try {
    execFileSync("arduino-cli", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe("arm firmware sketch", () => {
  it("uses the same joint limits and gripper closed angle as the shared protocol", () => {
    // 펌웨어의 상수가 프로토콜 정의와 어긋나면 시뮬레이션과 실물이 다르게 동작한다
    const min = /LIMIT_MIN\[JOINTS\] = \{([^}]*)\}/.exec(source)?.[1]?.split(",").map(Number);
    const max = /LIMIT_MAX\[JOINTS\] = \{([^}]*)\}/.exec(source)?.[1]?.split(",").map(Number);
    expect(min).toEqual(LIMITS_DEG.map((l) => l[0]));
    expect(max).toEqual(LIMITS_DEG.map((l) => l[1]));
    expect(Number(/GRIPPER_CLOSED_DEG = (\d+)/.exec(source)?.[1])).toBe(GRIPPER_CLOSED_DEG);
  });

  it("answers every protocol command the PC may send", () => {
    for (const reply of ["OK PING", "ERR RANGE", "ERR ARGS", "ERR CMD", "POS", "MOVING"]) {
      expect(source).toContain(reply);
    }
  });

  it.skipIf(!hasArduinoCli)(
    "compiles for the Uno (needs arduino-cli; skipped in CI)",
    async () => {
      const r = await compileSketch(source, { fileName: "robot-arm-firmware.ino" });
      expect(r.ok).toBe(true);
    },
    120_000,
  );
});
