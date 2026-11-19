/**
 * PC 쪽 스크립트 → Serial 줄 (역기구학은 PC에서 한다):
 *   MOVE x y z [m]   끝점을 (x, y, z)로 (그리퍼는 수직 아래) → `J ...`
 *   GRIP OPEN|CLOSE  → `G ...`
 *   WAIT             컨트롤러가 멈출 때까지 기다린다
 *   DWELL s          s초 기다린다
 *   그 밖의 줄(S 120, HOME, STATUS, PING …)은 그대로 보낸다. `#` 뒤는 주석.
 */
import { type ArmGeometry, inverse, type JointWindows } from "./arm-kinematics.ts";

const DEG = 180 / Math.PI;

export type ScriptStep =
  | { readonly kind: "send"; readonly line: string }
  | { readonly kind: "wait" }
  | { readonly kind: "dwell"; readonly seconds: number };

export interface CompiledScript {
  readonly steps: readonly ScriptStep[];
  /** 컴파일 오류 (줄 번호, 이유). 오류가 있어도 나머지 줄은 컴파일한다. */
  readonly errors: readonly { readonly line: number; readonly message: string }[];
}

export interface ArmHostConfig {
  readonly geometry: ArmGeometry;
  readonly windows: JointWindows;
  /** 서보 장착 오프셋 [rad]: 서보 명령 = 관절 각도 − 오프셋. */
  readonly offsets: { readonly shoulder: number; readonly elbow: number; readonly wrist: number };
}

export function compileScript(text: string, cfg: ArmHostConfig): CompiledScript {
  const steps: ScriptStep[] = [];
  const errors: { line: number; message: string }[] = [];
  /** 그리퍼는 MOVE가 모르는 채로 두면 안 되므로, J 명령의 마지막 값에 쓸 현재 그리퍼 각도를 기억한다. */
  let gripper = 0;
  for (const [i, raw] of text.split("\n").entries()) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [word = "", ...args] = line.split(/\s+/);
    const up = word.toUpperCase();
    const fail = (message: string) => errors.push({ line: i + 1, message });
    if (up === "WAIT") {
      steps.push({ kind: "wait" });
    } else if (up === "DWELL") {
      const s = Number(args[0]);
      if (Number.isFinite(s) && s >= 0) steps.push({ kind: "dwell", seconds: s });
      else fail("DWELL은 0 이상의 초가 필요하다");
    } else if (up === "GRIP") {
      const w = args[0]?.toUpperCase();
      if (w !== "OPEN" && w !== "CLOSE") {
        fail("GRIP은 OPEN 또는 CLOSE");
      } else {
        gripper = w === "CLOSE" ? 57 : 0;
        steps.push({ kind: "send", line: `G ${w}` });
      }
    } else if (up === "MOVE") {
      const [x, y, z] = args.map(Number);
      if (args.length < 3 || [x, y, z].some((v) => v === undefined || !Number.isFinite(v))) {
        fail("MOVE x y z (m)");
        continue;
      }
      const r = inverse(
        cfg.geometry,
        { x: x as number, y: y as number, z: z as number },
        cfg.windows,
      );
      if (!r.reachable) {
        fail(`닿지 않는 위치: (${x}, ${y}, ${z}) m`);
        continue;
      }
      const a = r.angles;
      const servo = [
        a.base * DEG,
        (a.shoulder - cfg.offsets.shoulder) * DEG,
        (a.elbow - cfg.offsets.elbow) * DEG,
        (a.wrist - cfg.offsets.wrist) * DEG,
        gripper,
      ].map((v) => Math.round(v * 100) / 100);
      steps.push({ kind: "send", line: `J ${servo.join(" ")}` });
    } else {
      steps.push({ kind: "send", line });
    }
  }
  return { steps, errors };
}
