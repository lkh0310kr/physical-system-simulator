/** 바이너리 STL: 80바이트 헤더 + 삼각형 수 + (법선 12 + 꼭짓점 36 + 속성 2)바이트 × N. 단위는 mm. */
import type { Mesh } from "./geometry.ts";

export function writeStl(mesh: Mesh, name = "physisim"): Uint8Array {
  const tris = mesh.indices.length / 3;
  const out = new DataView(new ArrayBuffer(84 + tris * 50));
  const header = new TextEncoder().encode(`PhysiSim ${name}`.slice(0, 79));
  new Uint8Array(out.buffer).set(header, 0);
  out.setUint32(80, tris, true);
  const p = mesh.positions;
  const at = (i: number, k: number) => p[(mesh.indices[i] ?? 0) * 3 + k] ?? 0;
  for (let t = 0; t < tris; t++) {
    const o = 84 + t * 50;
    const [a, b, c] = [t * 3, t * 3 + 1, t * 3 + 2];
    const e1 = [0, 1, 2].map((k) => at(b, k) - at(a, k));
    const e2 = [0, 1, 2].map((k) => at(c, k) - at(a, k));
    const n = [
      (e1[1] ?? 0) * (e2[2] ?? 0) - (e1[2] ?? 0) * (e2[1] ?? 0),
      (e1[2] ?? 0) * (e2[0] ?? 0) - (e1[0] ?? 0) * (e2[2] ?? 0),
      (e1[0] ?? 0) * (e2[1] ?? 0) - (e1[1] ?? 0) * (e2[0] ?? 0),
    ];
    const len = Math.hypot(n[0] ?? 0, n[1] ?? 0, n[2] ?? 0) || 1;
    for (let k = 0; k < 3; k++) out.setFloat32(o + k * 4, (n[k] ?? 0) / len, true);
    [a, b, c].forEach((v, j) => {
      for (let k = 0; k < 3; k++) out.setFloat32(o + 12 + j * 12 + k * 4, at(v, k), true);
    });
  }
  return new Uint8Array(out.buffer);
}
