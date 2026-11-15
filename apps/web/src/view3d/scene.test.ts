import { loadSystemProject } from "@physisim/core";
import { createStandardRegistry } from "@physisim/models";
import { describe, expect, it } from "vitest";
import { activityOf, buildScene3d, PLACEHOLDER_SIZE, sceneBounds } from "./scene.ts";

const load = (assembly?: unknown) => {
  const r = loadSystemProject(
    {
      name: "t",
      instances: [
        { id: "bat", model: "model.li-ion-cell" },
        { id: "r1", model: "model.resistor" },
      ],
      connections: [],
      ...(assembly ? { assembly } : {}),
    },
    () => undefined,
    createStandardRegistry,
  );
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
};

describe("buildScene3d", () => {
  it("places declared instances at their assembly positions in metres", () => {
    const boxes = buildScene3d(load({ bat: { position: [10, "2cm", 0], rotation: [0, 0, 90] } }));
    const bat = boxes.find((b) => b.id === "bat");
    expect(bat?.position[0]).toBeCloseTo(0.01);
    expect(bat?.position[1]).toBeCloseTo(0.02);
    expect(bat?.rotation).toEqual([0, 0, 90]);
  });

  it("lays out parts without an assembly entry side by side without overlapping", () => {
    const [a, b] = buildScene3d(load());
    if (!a || !b) throw new Error("fixture");
    expect(b.position[0] - b.size[0] / 2).toBeGreaterThan(a.position[0] + a.size[0] / 2);
  });

  it("marks parts without a body as placeholders so assumed sizes are not shown as real", () => {
    const boxes = buildScene3d(load());
    const placeholder = boxes.find((b) => !b.real);
    expect(placeholder?.size).toEqual(PLACEHOLDER_SIZE);
  });
});

describe("sceneBounds", () => {
  it("wraps all boxes and is undefined when empty", () => {
    expect(sceneBounds([])).toBeUndefined();
    const [min, max] =
      sceneBounds(
        buildScene3d(load({ bat: { position: [0, 0, 0] }, r1: { position: [50, 0, 0] } })),
      ) ?? [];
    expect((max?.[0] ?? 0) - (min?.[0] ?? 0)).toBeGreaterThan(0.05);
  });
});

describe("activityOf", () => {
  it("is the LED brightness, 1 for a closed switch, 1 for an awake node, else 0", () => {
    expect(activityOf("led1", { "led1.brightness": 0.4 })).toBe(0.4);
    expect(activityOf("led1", { "led1.brightness": 7 })).toBe(1);
    expect(activityOf("btn", { "btn.closed": true })).toBe(1);
    expect(activityOf("btn", { "btn.closed": false })).toBe(0);
    expect(activityOf("node", { "node.phase": "capture" })).toBe(1);
    expect(activityOf("node", { "node.phase": "sleep" })).toBe(0);
    expect(activityOf("none", {})).toBe(0);
  });

  it("flags switch parts so the 3D view can press them", () => {
    const r = loadSystemProject(
      {
        name: "t",
        instances: [
          { id: "btn", model: "model.pushbutton" },
          { id: "r1", model: "model.resistor" },
        ],
      },
      () => undefined,
      createStandardRegistry,
    );
    if (!r.ok) throw new Error("fixture");
    expect(buildScene3d(r.value).map((b) => [b.id, b.switchable])).toEqual([
      ["btn", true],
      ["r1", false],
    ]);
  });
});

describe("detailed parts", () => {
  it("converts XIAO module parts to metres relative to the body centre", () => {
    const r = loadSystemProject(
      {
        name: "t",
        instances: [{ id: "xiao", model: "model.xiao-esp32s3-sense" }],
        connections: [],
      },
      () => undefined,
      createStandardRegistry,
    );
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    const [box] = buildScene3d(r.value);
    const parts = box?.parts ?? [];
    expect(parts.length).toBeGreaterThan(10);
    const pcb = parts.find((p) => p.name === "pcb-main");
    expect(pcb?.kind === "box" && pcb.size[0]).toBeCloseTo(0.02095, 5);
    // 모든 세부 형상이 body 상자 안에 있어야 한다 (표시와 계산이 어긋나지 않게)
    const half = (box?.size ?? [0, 0, 0]).map((v) => v / 2 + 1e-6);
    for (const p of parts) {
      const ext = p.kind === "box" ? p.size : [p.diameter, p.diameter, p.length];
      const e = p.kind === "cylinder" && p.axis !== "z" ? ext : ext;
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(p.position[i] ?? 0) + (e[i] ?? 0) / 2).toBeLessThanOrEqual(half[i] ?? 0);
      }
    }
  });
});
