/**
 * dev 서버의 프로젝트 파일 API (스펙 §10.1, Phase 5).
 * 브라우저 에디터와 코딩 에이전트가 같은 로컬 파일을 편집한다:
 *   GET  /api/files              프로젝트 안의 .json/.js 파일 목록
 *   GET  /api/file?path=…        파일 읽기
 *   PUT  /api/file?path=…        파일 쓰기 (본문 = 내용)
 *   GET  /api/systems            모든 System 파일의 이름·설명 (예제 갤러리)
 *   GET  /api/case(/download)    케이스 메시·STL/3MF/BOM (case-api.ts)
 *   POST /api/compile?path=…     Arduino 스케치(.ino) 컴파일 → { ok, hex } | { ok: false, issues }
 *   HMR 이벤트 "physisim:file"   파일이 바뀌면 { path } 알림
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { compileSketch } from "@physisim/avr/compile";
import type { Plugin } from "vite";
import { handleCase } from "./case-api.ts";

const EXTENSIONS = new Set([".json", ".js", ".ino"]);
const SKIP = new Set(["node_modules", ".git", "dist"]);

/** 프로젝트 기준 상대 경로를 절대 경로로. 프로젝트 밖을 가리키면 `undefined`. */
export function resolveInside(root: string, path: string): string | undefined {
  if (!path || isAbsolute(path)) return undefined;
  const abs = resolve(root, path);
  const rel = relative(root, abs);
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? abs : undefined;
}

/** 프로젝트 안의 편집 대상 파일 (상대 경로, `/` 구분, 정렬). */
export function listProjectFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (SKIP.has(name) || name.startsWith(".")) continue;
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) walk(abs);
      else if (EXTENSIONS.has(extname(name))) out.push(relative(root, abs).split(sep).join("/"));
    }
  };
  walk(root);
  return out.sort();
}

async function body(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function send(
  res: ServerResponse,
  status: number,
  data: string,
  type = "text/plain; charset=utf-8",
) {
  res.statusCode = status;
  res.setHeader("content-type", type);
  res.end(data);
}

export function projectApi(root: string): Plugin {
  return {
    name: "physisim-project-api",
    configureServer(server) {
      server.watcher.add(root);
      const notify = (abs: string) => {
        const rel = relative(root, abs);
        if (rel.startsWith("..") || !EXTENSIONS.has(extname(abs))) return;
        server.ws.send({
          type: "custom",
          event: "physisim:file",
          data: { path: rel.split(sep).join("/") },
        });
      };
      server.watcher.on("change", notify);
      server.watcher.on("add", notify);
      server.watcher.on("unlink", notify);

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "", "http://localhost");
        if (url.pathname === "/api/files" && req.method === "GET") {
          return send(
            res,
            200,
            JSON.stringify({ root, files: listProjectFiles(root) }),
            "application/json",
          );
        }
        if (
          (url.pathname === "/api/case" || url.pathname === "/api/case/download") &&
          req.method === "GET"
        ) {
          try {
            return await handleCase(root, url, res, url.pathname.endsWith("/download"));
          } catch (e) {
            return send(res, 500, (e as Error).message);
          }
        }
        if (url.pathname === "/api/systems" && req.method === "GET") {
          // 예제 갤러리용: 모든 System 파일의 이름·설명 (잘못된 JSON은 파일 이름만)
          const systems = listProjectFiles(root)
            .filter((f) => f.endsWith(".system.json"))
            .map((path) => {
              try {
                const doc = JSON.parse(readFileSync(join(root, path), "utf8"));
                return {
                  path,
                  name: String(doc.name ?? path),
                  description: String(doc.description ?? ""),
                  parts: Array.isArray(doc.instances) ? doc.instances.length : 0,
                };
              } catch {
                return { path, name: path, description: "(읽을 수 없는 파일)", parts: 0 };
              }
            });
          return send(res, 200, JSON.stringify({ systems }), "application/json");
        }
        if (url.pathname === "/api/compile" && req.method === "POST") {
          const rel = url.searchParams.get("path") ?? "";
          const abs = resolveInside(root, rel);
          if (!abs) return send(res, 400, "프로젝트 밖의 경로");
          let source: string;
          try {
            source = readFileSync(abs, "utf8");
          } catch (e) {
            return send(res, 404, (e as Error).message);
          }
          const r = await compileSketch(source, { fileName: rel });
          return send(
            res,
            200,
            JSON.stringify(r.ok ? { ok: true, hex: r.value } : r),
            "application/json",
          );
        }
        if (url.pathname !== "/api/file") return next();
        const abs = resolveInside(root, url.searchParams.get("path") ?? "");
        if (!abs) return send(res, 400, "프로젝트 밖의 경로");
        try {
          if (req.method === "GET") return send(res, 200, readFileSync(abs, "utf8"));
          if (req.method === "PUT") {
            mkdirSync(dirname(abs), { recursive: true });
            writeFileSync(abs, await body(req));
            return send(res, 204, "");
          }
          return send(res, 405, "GET 또는 PUT");
        } catch (e) {
          return send(res, 404, (e as Error).message);
        }
      });
    },
  };
}
