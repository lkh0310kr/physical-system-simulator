import { defineBehavior } from "@physisim/core";
import {
  advance,
  apply,
  GRIPPER_CLOSED_DEG,
  initialMotion,
  isMoving,
  type MotionState,
  parseCommand,
} from "../arm-protocol.ts";

interface ControllerState {
  readonly motion: MotionState;
  readonly lastLineId: number;
  readonly reply: string;
  readonly replyId: number;
}

const RAD = Math.PI / 180;

/** Arduino 펌웨어 모델: 새 줄(`line`, 번호 `lineId`)이 오면 파싱·적용하고 응답을 내며, 매 스텝 목표를 향해 조정 이동한다. */
export const armController = defineBehavior<ControllerState>({
  id: "behavior.arm-controller",
  init: () => ({ motion: initialMotion(), lastLineId: 0, reply: "", replyId: 0 }),
  step: (s, inputs, ctx) => {
    const id = Number(inputs.lineId ?? 0);
    let motion = s.motion;
    let reply = s.reply;
    let replyId = s.replyId;
    if (id !== s.lastLineId && typeof inputs.line === "string") {
      const parsed = parseCommand(inputs.line);
      if (parsed.ok) {
        const r = apply(motion, parsed.command);
        motion = r.state;
        reply = r.reply;
      } else {
        reply = parsed.reply;
      }
      replyId += 1;
    }
    motion = advance(motion, ctx.dt);
    const c = motion.current;
    return {
      state: { motion, lastLineId: id, reply, replyId },
      outputs: {
        cmd1: (c[0] ?? 0) * RAD,
        cmd2: (c[1] ?? 0) * RAD,
        cmd3: (c[2] ?? 0) * RAD,
        cmd4: (c[3] ?? 0) * RAD,
        cmd5: Math.min(GRIPPER_CLOSED_DEG, c[4] ?? 0) * RAD,
        moving: isMoving(motion),
        reply,
        replyId,
      },
    };
  },
});
