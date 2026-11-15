/** 디렉터리에서 형상 파일(glb)을 읽는 `readMesh`. 정밀 간섭 검사에 쓴다 (Node 전용). */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function meshDirReader(dir: string): (file: string) => Uint8Array | undefined {
  return (file) => {
    const path = join(dir, file);
    return existsSync(path) ? readFileSync(path) : undefined;
  };
}
