import { defineBehavior, numberOf } from "@physisim/core";
import { type JointWindows, symmetricWindows } from "../arm-kinematics.ts";
import { type CompiledScript, compileScript } from "../arm-script.ts";

interface HostState {
  readonly compiled: CompiledScript | undefined;
  readonly scriptText: string;
  readonly step: number;
  /** 현재 단계에서 기다린 시간 [s] (WAIT 홀드오프·DWELL). */
  readonly timer: number;
  readonly line: string;
  readonly lineId: number;
  readonly lastReply: string;
}

const RAD = Math.PI / 180;

/** 스크립트를 한 번 컴파일해 단계별로 실행한다. 줄을 보낸 직후에는 컨트롤러가 반응할 시간(`holdoff`)을 주고 WAIT를 판단한다. */
export const serialHost = defineBehavior<HostState>({
  id: "behavior.serial-host",
  init: () => ({
    compiled: undefined,
    scriptText: "",
    step: 0,
    timer: 0,
    line: "",
    lineId: 0,
    lastReply: "",
  }),
  step: (s, inputs, ctx) => {
    const p = (k: string) => numberOf(ctx.properties, k);
    const text = String(ctx.properties.script ?? "");
    let compiled = s.compiled;
    if (!compiled || text !== s.scriptText) {
      const off = {
        shoulder: p("shoulderOffset"),
        elbow: p("elbowOffset"),
        wrist: p("wristOffset"),
      };
      const half = (o: number, h: number): readonly [number, number] => [o - h, o + h];
      const windows: JointWindows = {
        ...symmetricWindows(Math.PI),
        base: [-90 * RAD, 90 * RAD],
        shoulder: half(off.shoulder, 60 * RAD),
        elbow: half(off.elbow, 60 * RAD),
        wrist: half(off.wrist, 90 * RAD),
      };
      compiled = compileScript(text, {
        geometry: {
          baseHeight: p("baseHeight"),
          link1: p("link1"),
          link2: p("link2"),
          gripper: p("gripperLength"),
        },
        windows,
        offsets: off,
      });
    }
    const steps = compiled.steps;
    const reply = typeof inputs.reply === "string" && inputs.reply ? inputs.reply : s.lastReply;
    const current = steps[s.step];
    let { step, timer, line, lineId } = s;
    timer += ctx.dt;
    if (current) {
      if (current.kind === "send") {
        line = current.line;
        lineId += 1;
        step += 1;
        timer = 0;
      } else if (current.kind === "dwell") {
        if (timer >= current.seconds) {
          step += 1;
          timer = 0;
        }
      } else if (timer >= p("holdoff") && inputs.moving === false) {
        // WAIT: 줄을 보낸 뒤 컨트롤러가 움직임을 시작할 틈을 준 다음, 멈췄으면 진행
        step += 1;
        timer = 0;
      }
    }
    return {
      state: { compiled, scriptText: text, step, timer, line, lineId, lastReply: reply },
      outputs: {
        line,
        lineId,
        step,
        done: step >= steps.length,
        errors: compiled.errors.length,
        lastReply: reply,
      },
    };
  },
});
