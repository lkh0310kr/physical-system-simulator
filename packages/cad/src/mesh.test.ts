import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createStandardRegistry } from "@physisim/models";
import { describe, expect, it } from "vitest";

const publicDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../apps/web/public/meshes",
);

/** glb의 JSON 청크에서 POSITION 접근자 범위를 읽어 전체 외곽을 구한다. */
function glbBounds(file: string) {
  const buf = readFileSync(resolve(publicDir, file));
  expect(buf.toString("ascii", 0, 4)).toBe("glTF");
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.toString("utf8", 20, 20 + jsonLen));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of gltf.meshes)
    for (const prim of mesh.primitives) {
      const acc = gltf.accessors[prim.attributes.POSITION];
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i] ?? 0, acc.min[i]);
        max[i] = Math.max(max[i] ?? 0, acc.max[i]);
      }
    }
  return { min, max };
}

describe("model meshes", () => {
  it("every referenced mesh exists and fits inside its body box (the calculation box matches the shown geometry)", () => {
    const registry = createStandardRegistry();
    for (const model of registry.models()) {
      const body = model.body;
      if (!body?.mesh) continue;
      const { min, max } = glbBounds(body.mesh);
      const size = body.size.map((v) => (typeof v === "number" ? v / 1000 : 0));
      for (let i = 0; i < 3; i++) {
        // 1% 여유: STEP 외곽 상자 반올림
        const tol = (size[i] ?? 0) * 0.01 + 1e-5;
        expect(-(min[i] ?? 0)).toBeLessThanOrEqual((size[i] ?? 0) / 2 + tol);
        expect(max[i] ?? 0).toBeLessThanOrEqual((size[i] ?? 0) / 2 + tol);
      }
    }
  });
});
