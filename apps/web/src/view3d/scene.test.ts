import { loadSystemProject } from "@physisim/core";
import { createStandardRegistry } from "@physisim/models";
import { describe, expect, it } from "vitest";
import { activityOf, buildCables, buildScene3d, PLACEHOLDER_SIZE, sceneBounds } from "./scene.ts";

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

describe("buildCables", () => {
  const load3 = () => {
    const r = loadSystemProject(
      {
        name: "t",
        instances: [
          { id: "bat", model: "model.lipo-adafruit-1317" },
          { id: "node", model: "model.xiao-esp32s3-sense" },
        ],
        connections: [
          ["bat:+", "node:VCC"],
          ["bat:-", "node:GND"],
        ],
        assembly: {
          node: { position: [0, 0, 0] },
          bat: { position: [-2.5, 0, -8.89], rotation: [0, 0, 90] },
        },
      },
      () => undefined,
      createStandardRegistry,
    );
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    return r.value;
  };

  it("draws one cable per connection whose both ends have pin locations, ground in black", () => {
    const loaded = load3();
    const cables = buildCables(loaded, buildScene3d(loaded));
    expect(cables).toHaveLength(2);
    expect(cables.map((c) => c.ground)).toEqual([false, true]);
  });

  it("puts the XIAO BAT+ pad on the back of the board, 2 mm from BAT-, with BAT- nearer the USB end", () => {
    const loaded = load3();
    const cables = buildCables(loaded, buildScene3d(loaded));
    const plus = cables[0]?.to;
    const minus = cables[1]?.to;
    if (!plus || !minus) throw new Error("cables");
    expect(minus[0] - plus[0]).toBeCloseTo(0.00191, 4); // 4.03 − 2.12 mm, USB는 +x 쪽
    expect(plus[2]).toBeCloseTo(-0.00697, 4); // 보드 뒷면
  });

  it("skips connections where an end has no pin location (e.g. a part without a body)", () => {
    const loaded = load3();
    const boxes = buildScene3d(loaded);
    expect(
      buildCables({ ...loaded, doc: { ...loaded.doc, connections: [["bat:+", "btn:1"]] } }, boxes),
    ).toEqual([]);
  });
});
