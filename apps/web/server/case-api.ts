/**
 * dev 서버의 케이스 API (P7-T18). 형상 연산(manifold WASM)은 서버에서 돌리고 브라우저는 결과 메시만 받는다.
 *   GET /api/case?path=…                              → { ok, issues, outer, parts[base,lid] 메시(mm) }
 *   GET /api/case/download?path=…&file=base|lid|3mf|bom → 출력 자세의 STL/3MF/BOM CSV (검증 통과 시에만)
 */
import { readFileSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bomCsv,
  bomOf,
  buildCase,
  inspect,
  meshDirReader,
  meshOf,
  printLayout,
  resolveProfile,
  write3mf,
  writeStl,
} from "@physisim/cad";
import { loadSystemProject } from "@physisim/core";
import { createStandardRegistry } from "@physisim/models";
import { resolveInside } from "./project-api.ts";

/** 웹 앱이 서비스하는 제작사 형상 폴더 — 정밀 간섭 검사에도 같은 파일을 쓴다. */
const MESH_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../public/meshes");

const json = (res: ServerResponse, status: number, data: unknown) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(data));
};

const bytes = (res: ServerResponse, name: string, type: string, data: Uint8Array | string) => {
  res.statusCode = 200;
  res.setHeader("content-type", type);
  res.setHeader("content-disposition", `attachment; filename="${name}"`);
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
  const loaded = loadSystemProject(
    JSON.parse(text),
    (r) => {
      try {
        return readFileSync(resolve(dirname(abs), r), "utf8");
      } catch {
        return undefined;
      }
    },
    createStandardRegistry,
  );
  if (!loaded.ok) return json(res, 422, { message: "System 검증 실패", issues: loaded.issues });
  const profile = resolveProfile(url.searchParams.get("process") ?? undefined);
  if (!profile.ok) return json(res, 400, { message: profile.message });

  const result = await buildCase(loaded.value, profile.value, {
    readMesh: meshDirReader(MESH_DIR),
  });
  const g = result.geometry;
  if (!download) {
    const packMesh = (m: ReturnType<typeof meshOf>) => ({
      positions: Array.from(m.positions),
      indices: Array.from(m.indices),
    });
    const pack = (solid: typeof g.base) => packMesh(meshOf(solid));
    return json(res, 200, {
      ok: result.ok,
      issues: result.issues,
      outer: g.outer,
      cavity: g.cavity,
      base: pack(g.base),
      lid: pack(g.lid),
      print: {
        base: packMesh(printLayout(g).base),
        lid: packMesh(printLayout(g).lid),
      },
      process: profile.value.name,
    });
  }
  if (!result.ok)
    return json(res, 422, { message: "검증 실패 — 내보내지 않음", issues: result.issues });
  const name = rel.replace(/^.*\//, "").replace(/\.system\.json$|\.json$/, "");
  const print = printLayout(g);
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
        loaded.value,
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
