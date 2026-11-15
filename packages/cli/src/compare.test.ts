import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compareSystems, formatComparison } from "./compare.ts";

const ex = (name: string) => join(import.meta.dirname, "../../../examples", name);
const files = [
  ex("camera-case-a2-ov2640.system.json"),
  ex("camera-case-a3-ov5640.system.json"),
  ex("camera-case-b-p4-c6.system.json"),
];

describe("compareSystems (camera cases under the same press)", async () => {
  const r = await compareSystems(
    files,
    { duration: 4, presses: [{ instance: "btn", at: 1, hold: 0.2 }] },
    "node",
    "bat",
    100,
  );
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  const [a2, a3, b] = r.value;

  it("measures one capture per case", () => {
    expect([a2, a3, b].map((x) => x?.report.captures.length)).toEqual([1, 1, 1]);
  });

  it("ranks the OV5640 cases as more expensive per capture than the OV2640 case", () => {
    expect(a3?.report.meanChargeMah).toBeGreaterThan(a2?.report.meanChargeMah ?? 0);
    expect(b?.report.meanChargeMah).toBeGreaterThan(a2?.report.meanChargeMah ?? 0);
  });

  it("shows Case B's two-chip sleep drain (P4 12 µA + C6 7 µA) above Case A's 8 µA", () => {
    expect(a2?.report.sleepMicroamps).toBeCloseTo(7.9, 1);
    expect(b?.report.sleepMicroamps).toBeCloseTo(18.8, 1);
  });

  it("carries each model's unverified assumptions into the table", () => {
    expect(b?.assumptions.some((a) => a.includes("ISP"))).toBe(true);
    const text = formatComparison(r.value, 100);
    expect(text).toContain("미확인 가정");
    expect(text).toContain("Case B (ESP32-P4 + C6 + OV5640)");
  });

  it("reports a missing system file with its path", async () => {
    const bad = await compareSystems(["/nope.system.json"], { duration: 1 }, "node", "bat", 1);
    expect(!bad.ok && bad.issues[0]?.path).toContain("/nope.system.json");
  });
});
