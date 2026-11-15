import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type WatchResult, watchSystem } from "./watch.ts";

/** 에이전트가 하는 일을 흉내 낸다: 파일을 쓰고, watch가 내놓는 다음 결과를 기다린다. */
function agentSession() {
  const dir = mkdtempSync(join(tmpdir(), "physisim-watch-"));
  const results: WatchResult[] = [];
  const waiters: ((r: WatchResult) => void)[] = [];
  const write = (name: string, content: unknown) =>
    writeFileSync(
      join(dir, name),
      typeof content === "string" ? content : JSON.stringify(content, null, 2),
    );
  const next = () =>
    new Promise<WatchResult>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("watch 결과가 오지 않았다")), 5000);
      waiters.push((r) => {
        clearTimeout(t);
        resolve(r);
      });
    });
  const start = () =>
    watchSystem(join(dir, "s.system.json"), { duration: 1, debounceMs: 30 }, (r) => {
      results.push(r);
      waiters.shift()?.(r);
    });
  return { dir, write, next, start, results };
}

const blinkSystem = (extra: { instances?: unknown[]; connections?: unknown[] } = {}) => ({
  name: "agent demo",
  instances: [
    { id: "uno", model: "model.arduino-uno", program: "p.js" },
    { id: "r1", model: "model.resistor", properties: { resistance: "220Ω" } },
    { id: "led1", model: "model.led" },
    ...(extra.instances ?? []),
  ],
  connections: [
    ["uno:D13", "r1:1"],
    ["r1:2", "led1:A"],
    ["led1:C", "uno:GND.1"],
    ...(extra.connections ?? []),
  ],
});

const program = (pins: number[]) => `
function setup() { ${pins.map((p) => `pinMode(${p}, OUTPUT);`).join(" ")} }
function* loop() {
  ${pins.map((p) => `digitalWrite(${p}, HIGH);`).join(" ")} yield delay(500);
  ${pins.map((p) => `digitalWrite(${p}, LOW);`).join(" ")} yield delay(500);
}`;

let stop: (() => void) | undefined;
afterEach(() => stop?.());

describe("scenario: an agent edits files while physisim watch runs", () => {
  it("picks up each edit, reports mistakes with locations, and recovers when fixed", async () => {
    const s = agentSession();
    s.write("p.js", program([13]));
    s.write("s.system.json", blinkSystem());
    const first = s.next();
    const w = s.start();
    stop = w.close;

    const r1 = await first;
    expect(r1.ok && r1.run.trace.final["led1.brightness"]).toBeGreaterThan(0.5);
    expect(w.files().map((f) => f.split("/").pop())).toEqual(["s.system.json", "p.js"]);

    // "D12에 LED를 하나 더 달아줘"
    const r2p = s.next();
    s.write(
      "s.system.json",
      blinkSystem({
        instances: [
          { id: "r2", model: "model.resistor", properties: { resistance: "220Ω" } },
          { id: "led2", model: "model.led", properties: { color: "green" } },
        ],
        connections: [
          ["uno:D12", "r2:1"],
          ["r2:2", "led2:A"],
          ["led2:C", "uno:GND.2"],
        ],
      }),
    );
    await r2p;
    const r3p = s.next();
    s.write("p.js", program([13, 12]));
    const r3 = await r3p;
    expect(r3.ok && r3.run.trace.final["led2.brightness"]).toBeGreaterThan(0.5);

    // 잘못된 수정 → 위치가 담긴 오류
    const r4p = s.next();
    s.write("s.system.json", blinkSystem({ connections: [["led1:K", "uno:GND.3"]] }));
    const r4 = await r4p;
    expect(!r4.ok && r4.issues[0]).toMatchObject({
      path: "connections[3][0]",
      message: expect.stringContaining("K"),
    });

    // 고치면 다시 정상
    const r5p = s.next();
    s.write("s.system.json", blinkSystem());
    expect((await r5p).ok).toBe(true);
  });
});
