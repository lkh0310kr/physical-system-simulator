/**
 * 로봇팔 Serial 프로토콜 (PC ↔ Arduino Uno, 115200 baud, 줄 단위 ASCII, 줄 끝 '\n').
 * 펌웨어(`examples/robot-arm-firmware/robot-arm-firmware.ino`)와 시뮬레이션의 `model.arm-controller`가 같은 규칙을 따른다.
 *
 *   PING                      → OK PING
 *   J a1 a2 a3 a4 a5          → 서보 목표 각도 [deg] (서보 중앙 기준; 베이스·손목 ±90, 어깨·팔꿈치 ±60, 그리퍼 0~57). 범위를 넘으면 ERR RANGE
 *   G OPEN | G CLOSE          → 그리퍼 열기(0°) / 닫기(57°)
 *   S v                       → 최대 속도 v [deg/s] (1~360)
 *   HOME                      → 모든 서보 중앙(그리퍼 열림)
 *   STOP                      → 지금 자세에서 멈춤
 *   STATUS                    → POS a1 a2 a3 a4 a5 MOVING 0|1
 *   (그 밖)                    → ERR CMD
 * 모든 관절은 가장 많이 가야 하는 관절이 속도 v로 움직이고 나머지는 같은 시간에 도착하도록 비례해 움직인다.
 */
export const JOINT_COUNT = 5;

/** 서보 중앙 기준 허용 각도 [최소, 최대] deg: 베이스, 어깨, 팔꿈치, 손목, 그리퍼. */
export const LIMITS_DEG: readonly (readonly [number, number])[] = [
  [-90, 90],
  [-60, 60],
  [-60, 60],
  [-90, 90],
  [0, 57],
];

export const GRIPPER_CLOSED_DEG = 57;
export const DEFAULT_SPEED_DEG = 90;

export type Command =
  | { readonly kind: "PING" }
  | { readonly kind: "J"; readonly angles: readonly number[] }
  | { readonly kind: "G"; readonly close: boolean }
  | { readonly kind: "S"; readonly speed: number }
  | { readonly kind: "HOME" }
  | { readonly kind: "STOP" }
  | { readonly kind: "STATUS" };

export type ParseResult =
  | { readonly ok: true; readonly command: Command }
  | { readonly ok: false; readonly reply: "ERR CMD" | "ERR RANGE" | "ERR ARGS" };

export function parseCommand(line: string): ParseResult {
  const parts = line.trim().split(/\s+/).filter(Boolean);
  const word = parts[0]?.toUpperCase();
  const args = parts.slice(1);
  const err = (reply: "ERR CMD" | "ERR RANGE" | "ERR ARGS"): ParseResult => ({ ok: false, reply });
  switch (word) {
    case "PING":
    case "HOME":
    case "STOP":
    case "STATUS":
      return args.length === 0 ? { ok: true, command: { kind: word } } : err("ERR ARGS");
    case "J": {
      if (args.length !== JOINT_COUNT) return err("ERR ARGS");
      const angles = args.map(Number);
      if (angles.some((a) => !Number.isFinite(a))) return err("ERR ARGS");
      const inRange = angles.every((a, i) => {
        const [lo, hi] = LIMITS_DEG[i] ?? [0, 0];
        return a >= lo && a <= hi;
      });
      return inRange ? { ok: true, command: { kind: "J", angles } } : err("ERR RANGE");
    }
    case "G": {
      const w = args[0]?.toUpperCase();
      if (args.length !== 1 || (w !== "OPEN" && w !== "CLOSE")) return err("ERR ARGS");
      return { ok: true, command: { kind: "G", close: w === "CLOSE" } };
    }
    case "S": {
      const v = Number(args[0]);
      if (args.length !== 1 || !Number.isFinite(v) || v < 1 || v > 360) return err("ERR ARGS");
      return { ok: true, command: { kind: "S", speed: v } };
    }
    default:
      return err("ERR CMD");
  }
}

/** 컨트롤러 상태: 지금 각도·목표 각도 [deg], 최대 속도 [deg/s]. */
export interface MotionState {
  readonly current: readonly number[];
  readonly target: readonly number[];
  readonly speed: number;
}

export const initialMotion = (): MotionState => ({
  current: Array(JOINT_COUNT).fill(0),
  target: Array(JOINT_COUNT).fill(0),
  speed: DEFAULT_SPEED_DEG,
});

export const isMoving = (m: MotionState) =>
  m.current.some((c, i) => Math.abs(c - (m.target[i] ?? 0)) > 1e-6);

/** 명령을 적용해 새 상태와 응답을 돌려준다. */
export function apply(m: MotionState, c: Command): { state: MotionState; reply: string } {
  switch (c.kind) {
    case "PING":
      return { state: m, reply: "OK PING" };
    case "J":
      return { state: { ...m, target: c.angles }, reply: "OK" };
    case "G": {
      const target = [...m.target];
      target[4] = c.close ? GRIPPER_CLOSED_DEG : 0;
      return { state: { ...m, target }, reply: "OK" };
    }
    case "S":
      return { state: { ...m, speed: c.speed }, reply: "OK" };
    case "HOME":
      return { state: { ...m, target: Array(JOINT_COUNT).fill(0) }, reply: "OK" };
    case "STOP":
      return { state: { ...m, target: m.current }, reply: "OK" };
    case "STATUS":
      return {
        state: m,
        reply: `POS ${m.current.map((a) => Math.round(a * 10) / 10).join(" ")} MOVING ${isMoving(m) ? 1 : 0}`,
      };
  }
}

/** `dt`[s]만큼 목표로 이동: 가장 먼 관절이 속도 v로, 나머지는 같은 시간에 도착하도록 비례해서. */
export function advance(m: MotionState, dt: number): MotionState {
  const delta = m.target.map((t, i) => t - (m.current[i] ?? 0));
  const far = Math.max(...delta.map(Math.abs));
  if (far < 1e-9) return m;
  const travel = m.speed * dt;
  if (travel >= far) return { ...m, current: m.target };
  return { ...m, current: m.current.map((c, i) => c + ((delta[i] ?? 0) / far) * travel) };
}
