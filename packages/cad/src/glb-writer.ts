/** 단일 메시를 glb로 쓴다 (좌표는 호출자가 정한 단위 그대로 — PhysiSim body 좌표계 m로 쓰는 것이 약속). */
import type { Mesh } from "./geometry.ts";

export function writeGlb(
  mesh: Mesh,
  color: readonly [number, number, number] = [0.85, 0.83, 0.78],
): Uint8Array {
  const pos = new Uint8Array(
    mesh.positions.buffer,
    mesh.positions.byteOffset,
    mesh.positions.byteLength,
  );
  const idx = new Uint8Array(mesh.indices.buffer, mesh.indices.byteOffset, mesh.indices.byteLength);
  const pad = (n: number) => (4 - (n % 4)) % 4;
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    xs.push(mesh.positions[i] ?? 0);
    ys.push(mesh.positions[i + 1] ?? 0);
    zs.push(mesh.positions[i + 2] ?? 0);
  }
  const posLen = pos.length + pad(pos.length);
  const gltf = {
    asset: {
      version: "2.0",
      generator: "physisim @physisim/cad",
      extras: { frame: "PhysiSim body frame: metres, +z up" },
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [...color, 1],
          metallicFactor: 0,
          roughnessFactor: 0.6,
        },
        doubleSided: true,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: mesh.positions.length / 3,
        type: "VEC3",
        min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)],
        max: [Math.max(...xs), Math.max(...ys), Math.max(...zs)],
      },
      { bufferView: 1, componentType: 5125, count: mesh.indices.length, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: pos.length },
      { buffer: 0, byteOffset: posLen, byteLength: idx.length },
    ],
    buffers: [{ byteLength: posLen + idx.length }],
  };
  let json = new TextEncoder().encode(JSON.stringify(gltf));
  json = new Uint8Array([...json, ...new Array(pad(json.length)).fill(0x20)]);
  const binLen = posLen + idx.length + pad(idx.length);
  const total = 12 + 8 + json.length + 8 + binLen;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, json.length, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(json, 20);
  const binStart = 20 + json.length;
  dv.setUint32(binStart, binLen, true);
  dv.setUint32(binStart + 4, 0x004e4942, true);
  out.set(pos, binStart + 8);
  out.set(idx, binStart + 8 + posLen);
  return out;
}
