/**
 * glb 메시 → 닫힌 입체(manifold). 제작사 CAD 형상으로 케이스와의 간섭을 박스가 아니라 **실제 형상**으로 검사한다.
 * 변환기가 쓴 형식(재질별 프리미티브, 위치·인덱스만, body 좌표 m)만 읽는다. 반환 입체는 mm.
 */
import { loadGeometry, type Solid } from "./geometry.ts";

interface GltfAccessor {
  bufferView: number;
}
interface Gltf {
  meshes: { primitives: { attributes: { POSITION: number }; indices: number }[] }[];
  accessors: GltfAccessor[];
  bufferViews: { byteOffset: number; byteLength: number }[];
}

/** 같은 위치의 꼭짓점을 합쳐(STEP 면 경계가 분리돼 있다) 입체로 만든다. 입체가 못 되는 조각은 건너뛴다. */
export async function solidsOfGlb(data: Uint8Array): Promise<Solid[]> {
  const m = await loadGeometry();
  const buf = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (buf.getUint32(0, true) !== 0x46546c67) throw new Error("glb가 아니다");
  const jsonLen = buf.getUint32(12, true);
  const gltf = JSON.parse(new TextDecoder().decode(data.subarray(20, 20 + jsonLen))) as Gltf;
  const bin = 20 + jsonLen + 8;
  const slice = <T extends Float32Array | Uint32Array>(
    ctor: new (b: ArrayBuffer) => T,
    view: number,
  ) => {
    const v = gltf.bufferViews[view];
    if (!v) throw new Error("bufferView 없음");
    return new ctor(
      data.buffer.slice(
        data.byteOffset + bin + v.byteOffset,
        data.byteOffset + bin + v.byteOffset + v.byteLength,
      ) as ArrayBuffer,
    );
  };
  const solids: Solid[] = [];
  for (const mesh of gltf.meshes) {
    for (const prim of mesh.primitives) {
      const pos = slice(Float32Array, gltf.accessors[prim.attributes.POSITION]?.bufferView ?? 0);
      const idx = slice(Uint32Array, gltf.accessors[prim.indices]?.bufferView ?? 0);
      const weld = new Map<string, number>();
      const verts: number[] = [];
      const remap = new Uint32Array(pos.length / 3);
      for (let i = 0; i < pos.length / 3; i++) {
        const key = [0, 1, 2].map((j) => Math.round((pos[i * 3 + j] ?? 0) * 1e7)).join(",");
        let n = weld.get(key);
        if (n === undefined) {
          n = verts.length / 3;
          weld.set(key, n);
          verts.push(
            (pos[i * 3] ?? 0) * 1000,
            (pos[i * 3 + 1] ?? 0) * 1000,
            (pos[i * 3 + 2] ?? 0) * 1000,
          );
        }
        remap[i] = n;
      }
      const tri = new Uint32Array(idx.length);
      for (let i = 0; i < idx.length; i++) tri[i] = remap[idx[i] ?? 0] ?? 0;
      try {
        const mm = new m.Mesh({
          numProp: 3,
          vertProperties: new Float32Array(verts),
          triVerts: tri,
        });
        mm.merge();
        const solid = m.Manifold.ofMesh(mm);
        if (String(solid.status()) === "NoError" && !solid.isEmpty()) solids.push(solid);
      } catch {
        // 입체가 안 되는 조각은 정밀 검사에서 빠진다 (박스 검사는 그대로 적용)
      }
    }
  }
  return solids;
}
