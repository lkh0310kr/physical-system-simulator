/**
 * System 문서: Instance 목록 + 핀-핀 연결 (+ 선택적 화면 layout). 사람과 Agent가 작성하는 형식 (스펙 §8).
 *
 * ```json
 * {
 *   "name": "Blink",
 *   "instances": [{ "id": "uno", "model": "model.arduino-uno" }, { "id": "led1", "model": "model.led" }],
 *   "connections": [["uno:D13", "led1:A"], ["led1:C", "uno:GND.1"]],
 *   "layout": { "led1": { "x": 120, "y": 40 } }
 * }
 * ```
 */
import { z } from "zod";
import { InstanceDeclSchema } from "./instance.ts";
import type { Result } from "./issues.ts";
import { parseWith } from "./loader.ts";

/** `"<instance>:<port>"` 형식의 Port 참조. */
export const PortRefSchema = z.string().regex(/^[a-z][a-z0-9_-]*:[A-Za-z0-9_.+-]+$/, {
  message: '"instance:port" 형식이어야 한다 (예: "uno:D13")',
});

export const SystemSchema = z
  .strictObject({
    name: z.string().min(1),
    description: z.string().optional(),
    instances: z.array(InstanceDeclSchema).default([]),
    /** 두 Port를 잇는 선. 같은 Port에 여러 선이 닿으면 하나의 Net이 된다. */
    connections: z.array(z.tuple([PortRefSchema, PortRefSchema])).default([]),
    /** 에디터용 화면 정보. 엔진과 Agent는 해석하지 않는다. */
    layout: z.looseObject({}).optional(),
  })
  .superRefine((s, ctx) => {
    const seen = new Set<string>();
    s.instances.forEach((inst, i) => {
      if (seen.has(inst.id))
        ctx.addIssue({
          code: "custom",
          path: ["instances", i, "id"],
          message: `중복된 Instance ID: ${inst.id}`,
        });
      seen.add(inst.id);
    });
  });

export type SystemDoc = z.output<typeof SystemSchema>;
export type SystemDocInput = z.input<typeof SystemSchema>;

export const parseSystem = (json: unknown): Result<SystemDoc> => parseWith(SystemSchema, json, "");

/** `"uno:D13"` → `{ instance: "uno", port: "D13" }`. 형식은 스키마가 보장한다. */
export function splitPortRef(ref: string): { instance: string; port: string } {
  const i = ref.indexOf(":");
  return { instance: ref.slice(0, i), port: ref.slice(i + 1) };
}
