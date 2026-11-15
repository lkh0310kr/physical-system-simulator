/**
 * dev 서버의 케이스 API (P7-T18). 형상 연산(manifold WASM)은 서버에서 돌리고 브라우저는 결과 메시만 받는다.
 *   GET /api/case?path=…                              → { ok, issues, outer, parts[base,lid] 메시(mm) }
 *   GET /api/case/download?path=…&file=base|lid|3mf|bom → 출력 자세의 STL/3MF/BOM CSV (검증 통과 시에만)
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bomCsv,
  bomOf,
  buildCase,
  type CaseResult,
  disposeCase,
  inspect,
  meshDirReader,
  meshOf,
  printLayout,
  resolveProfile,
  write3mf,
  writeStl,
} from "@physisim/cad";
import { type LoadedSystem, loadSystemProject } from "@physisim/core";
import { createStandardRegistry } from "@physisim/models";
import { resolveInside } from "./project-api.ts";

/** 웹 앱이 서비스하는 제작사 형상 폴더 — 정밀 간섭 검사에도 같은 파일을 쓴다. */
const MESH_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../public/meshes");

/**
 * 같은 파일·같은 공정·같은 수정 시각이면 만든 케이스를 다시 쓴다 (뷰어 조회와 내려받기 여러 번이 같은 계산을 반복하지 않게).
 * 밀려난 항목은 WASM 메모리를 풀어 준다.
 */
const CACHE_SIZE = 3;
const cache = new Map<string, { result: CaseResult; loaded: LoadedSystem }>();
function remember(key: string, value: { result: CaseResult; loaded: LoadedSystem }) {
  cache.set(key, value);
  while (cache.size > CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    const old = cache.get(oldest);
    if (old) disposeCase(old.result.geometry);
    cache.delete(oldest);
  }
}

const json = (res: ServerResponse, status: number, data: unknown) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(data));
};

const bytes = (res: ServerResponse, name: string, type: string, data: Uint8Array | string) => {
  res.statusCode = 200;
  res.setHeader("content-type", type);
  // 파일명에 한글·따옴표가 있어도 헤더가 깨지지 않게: ASCII 대체 이름 + RFC 5987 인코딩 이름
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  res.setHeader(
    "content-disposition",
    `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
  );
  res.end(data);
};

export async function handleCase(
  root: string,
  url: URL,
  res: ServerResponse,
  download: boolean,
): Promise<void> {
  const rel = url.searchParams.get("path") ?? "";
  const abs = resolveInside(root, rel);
  if (!abs) return json(res, 400, { message: "프로젝트 밖의 경로" });
  let text: string;
  try {
    text = readFileSync(abs, "utf8");
  } catch (e) {
    return json(res, 404, { message: (e as Error).message });
  }
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    return json(res, 422, { message: `JSON을 읽을 수 없다: ${(e as Error).message}` });
  }
  // 참조 파일 내용도 캐시 키에 넣는다 — 로컬 부품 파일이 바뀌면 다시 만든다
  const hash = createHash("sha1").update(text);
  const loaded = loadSystemProject(
    doc,
    (r) => {
      try {
        const content = readFileSync(resolve(dirname(abs), r), "utf8");
        hash.update(r).update(content);
        return content;
      } catch {
        return undefined;
      }
    },
    createStandardRegistry,
  );
  if (!loaded.ok) return json(res, 422, { message: "System 검증 실패", issues: loaded.issues });
  const profile = resolveProfile(url.searchParams.get("process") ?? undefined);
  if (!profile.ok) return json(res, 400, { message: profile.message });

  const key = `${hash.update(profile.value.id).digest("hex")}`;
  let entry = cache.get(key);
  if (!entry) {
    const result = await buildCase(loaded.value, profile.value, {
      readMesh: meshDirReader(MESH_DIR),
    });
    entry = { result, loaded: loaded.value };
    remember(key, entry);
  }
  const { result } = entry;
  const g = result.geometry;
  // 출력 자세 메시는 한 번만 계산한다
  const print = printLayout(g);
  if (!download) {
    const packMesh = (m: ReturnType<typeof meshOf>) => ({
      positions: Array.from(m.positions),
      indices: Array.from(m.indices),
    });
    return json(res, 200, {
      ok: result.ok,
      issues: result.issues,
      outer: g.outer,
      cavity: g.cavity,
      base: packMesh(meshOf(g.base)),
      lid: packMesh(meshOf(g.lid)),
      print: { base: packMesh(print.base), lid: packMesh(print.lid) },
      process: profile.value.name,
    });
  }
  if (!result.ok)
    return json(res, 422, { message: "검증 실패 — 내보내지 않음", issues: result.issues });
  const name = rel.replace(/^.*\//, "").replace(/\.system\.json$|\.json$/, "");
  switch (url.searchParams.get("file")) {
    case "base":
      return bytes(res, `${name}-base.stl`, "model/stl", writeStl(print.base, `${name} base`));
    case "lid":
      return bytes(res, `${name}-lid.stl`, "model/stl", writeStl(print.lid, `${name} lid`));
    case "3mf":
      return bytes(
        res,
        `${name}-case.3mf`,
        "model/3mf",
        write3mf([
          { name: "base", mesh: print.base },
          { name: "lid", mesh: print.lid },
        ]),
      );
    case "bom": {
      const bom = bomOf(
        entry.loaded,
        [
          { name: "케이스 베이스", volumeMm3: inspect(g.base).volume },
          { name: "케이스 뚜껑", volumeMm3: inspect(g.lid).volume },
        ],
        profile.value,
      );
      return bytes(res, `${name}-bom.csv`, "text/csv; charset=utf-8", bomCsv(bom));
    }
    default:
      return json(res, 400, { message: "file은 base, lid, 3mf, bom 중 하나" });
  }
}
