import { describe, expect, it } from "vitest";
import { RECOMMENDED, recommendedWindows } from "./arm-design.ts";
import { forward } from "./arm-kinematics.ts";
import {
  advance,
  apply,
  type Command,
  initialMotion,
  isMoving,
  parseCommand,
} from "./arm-protocol.ts";
import { compileScript } from "./arm-script.ts";

const ok = (line: string): Command => {
  const r = parseCommand(line);
  if (!r.ok) throw new Error(`${line}: ${r.reply}`);
  return r.command;
};

describe("arm serial protocol: parsing (golden vectors shared with the firmware)", () => {
  it.each([
    ["PING", { kind: "PING" }],
    ["  ping  ", { kind: "PING" }],
    ["J 0 10 -20 30 57", { kind: "J", angles: [0, 10, -20, 30, 57] }],
    ["J -90 -60 60 90 0", { kind: "J", angles: [-90, -60, 60, 90, 0] }],
    ["G OPEN", { kind: "G", close: false }],
    ["g close", { kind: "G", close: true }],
    ["S 120", { kind: "S", speed: 120 }],
    ["HOME", { kind: "HOME" }],
    ["STOP", { kind: "STOP" }],
    ["STATUS", { kind: "STATUS" }],
  ])("%s", (line, command) => {
    expect(ok(line)).toEqual(command);
  });

  it.each([
    ["J 0 61 0 0 0", "ERR RANGE"],
    ["J 0 0 0 0 58", "ERR RANGE"],
    ["J 0 0 0 0 -1", "ERR RANGE"],
    ["J 1 2 3", "ERR ARGS"],
    ["J a b c d e", "ERR ARGS"],
    ["G HALF", "ERR ARGS"],
    ["S 0", "ERR ARGS"],
    ["S 400", "ERR ARGS"],
    ["PING now", "ERR ARGS"],
    ["DANCE", "ERR CMD"],
    ["", "ERR CMD"],
  ])("rejects %j with %s", (line, reply) => {
    expect(parseCommand(line)).toEqual({ ok: false, reply });
  });
});

describe("arm firmware motion", () => {
  it("J sets a target and the joints move together: the farthest joint at the set speed, the rest scaled to arrive at the same time", () => {
    let m = apply(initialMotion(), ok("S 60")).state;
    m = apply(m, ok("J 60 30 0 0 0")).state;
    m = advance(m, 0.5); // 60°/s × 0.5 s = 30° (가장 먼 관절)
    expect(m.current[0]).toBeCloseTo(30, 9);
    expect(m.current[1]).toBeCloseTo(15, 9);
    m = advance(m, 5);
    expect(m.current).toEqual([60, 30, 0, 0, 0]);
    expect(isMoving(m)).toBe(false);
  });

  it("STATUS reports positions and whether it is still moving; STOP freezes where it is", () => {
    let m = apply(initialMotion(), ok("J 90 0 0 0 0")).state;
    m = advance(m, 0.5);
    expect(apply(m, ok("STATUS")).reply).toBe("POS 45 0 0 0 0 MOVING 1");
    m = apply(m, ok("STOP")).state;
    expect(isMoving(m)).toBe(false);
    expect(apply(m, ok("STATUS")).reply).toBe("POS 45 0 0 0 0 MOVING 0");
  });

  it("G CLOSE changes only the gripper target; HOME returns everything to centre with the gripper open", () => {
    let m = apply(initialMotion(), ok("J 10 20 30 40 0")).state;
    m = apply(m, ok("G CLOSE")).state;
    expect(m.target).toEqual([10, 20, 30, 40, 57]);
    expect(apply(m, ok("HOME")).state.target).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("arm PC-side script compiler", () => {
  const cfg = {
    geometry: {
      baseHeight: RECOMMENDED.design.baseHeight,
      link1: RECOMMENDED.design.link1,
      link2: RECOMMENDED.design.link2,
      gripper: RECOMMENDED.design.gripper,
    },
    windows: recommendedWindows(),
    offsets: RECOMMENDED.offsets,
  };

  it("turns MOVE into a J line whose angles, applied through forward kinematics, land on the requested point", () => {
    const { steps, errors } = compileScript("MOVE 0.15 0.07 0.02", cfg);
    expect(errors).toEqual([]);
    const step = steps[0];
    if (step?.kind !== "send") throw new Error("send expected");
    const c = ok(step.line);
    if (c.kind !== "J") throw new Error("J expected");
    const rad = (d: number) => (d * Math.PI) / 180;
    const tip = forward(cfg.geometry, {
      base: rad(c.angles[0] ?? 0),
      shoulder: rad(c.angles[1] ?? 0) + cfg.offsets.shoulder,
      elbow: rad(c.angles[2] ?? 0) + cfg.offsets.elbow,
      wrist: rad(c.angles[3] ?? 0) + cfg.offsets.wrist,
    });
    expect(Math.hypot(tip.x - 0.15, tip.y - 0.07, tip.z - 0.02)).toBeLessThan(2e-3); // 소수 둘째 자리 반올림 오차
  });

  it("keeps the gripper state in later J lines, passes other commands through, and strips comments", () => {
    const { steps } = compileScript(
      "S 120  # speed\nGRIP CLOSE\nMOVE 0.15 0 0.05\nWAIT\nDWELL 0.5\nSTATUS",
      cfg,
    );
    const lines = steps.map((s) => (s.kind === "send" ? s.line : s.kind));
    expect(lines[0]).toBe("S 120");
    expect(lines[1]).toBe("G CLOSE");
    expect(lines[2]).toMatch(/^J .* 57$/);
    expect(lines.slice(3)).toEqual(["wait", "dwell", "STATUS"]);
  });

  it("reports unreachable points and malformed lines with their line numbers, and keeps compiling the rest", () => {
    const { steps, errors } = compileScript(
      "MOVE 0.5 0 0.02\nGRIP HALF\nDWELL x\nMOVE 1 2\nPING",
      cfg,
    );
    expect(errors.map((e) => e.line)).toEqual([1, 2, 3, 4]);
    expect(steps.map((s) => (s.kind === "send" ? s.line : s.kind))).toEqual(["PING"]);
  });
});
