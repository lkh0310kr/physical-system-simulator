/**
 * Arduino 스케치(.ino) 컴파일 — Node 전용 (`@physisim/avr/compile`). 브라우저 번들에 넣지 않는다.
 * arduino-cli(외부 도구, GPL-3)를 명령으로 호출만 한다. 같은 보드·소스는 결과 hex를 캐시한다.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Issue, Result } from "@physisim/core";

export interface CompileOptions {
  /** 보드 FQBN. 기본 Arduino UNO. */
  readonly fqbn?: string;
  /** arduino-cli 실행 파일. 기본 PATH의 `arduino-cli`. */
  readonly cli?: string;
  /** 캐시 폴더. 기본 OS 임시 폴더 아래. */
  readonly cacheDir?: string;
  /** 오류 위치에 붙일 파일 이름 (예: "blink.ino"). */
  readonly fileName?: string;
}

/**
 * 컴파일러 출력에서 오류를 뽑는다. `…/sketch.ino:12:5: error: …` → `{ path: "blink.ino:12:5", message }`.
 * 경고는 무시한다.
 */
export function parseCompilerErrors(output: string, fileName: string): Issue[] {
  const issues: Issue[] = [];
  for (const m of output.matchAll(/^[^\n]*?\.ino:(\d+):(\d+): (?:fatal )?error: (.+)$/gm)) {
    issues.push({ path: `${fileName}:${m[1]}:${m[2]}`, message: m[3] ?? "" });
  }
  return issues;
}

const run = (cmd: string, args: string[]) =>
  new Promise<{ code: number; output: string; missing: boolean }>((resolve) => {
    execFile(cmd, args, { maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      const e = err as (NodeJS.ErrnoException & { code?: number | string }) | null;
      resolve({
        code: e ? (typeof e.code === "number" ? e.code : 1) : 0,
        output: `${stdout}\n${stderr}`,
        missing: e?.code === "ENOENT",
      });
    });
  });

/** 스케치 소스를 컴파일해 Intel HEX 텍스트를 돌려준다. */
export async function compileSketch(
  source: string,
  options: CompileOptions = {},
): Promise<Result<string>> {
  const fqbn = options.fqbn ?? "arduino:avr:uno";
  const fileName = options.fileName ?? "sketch.ino";
  const cacheDir = options.cacheDir ?? join(tmpdir(), "physisim-build-cache");
  const hash = createHash("sha256").update(`${fqbn}\n${source}`).digest("hex").slice(0, 16);
  const cached = join(cacheDir, `${hash}.hex`);
  if (existsSync(cached)) return { ok: true, value: readFileSync(cached, "utf8") };

  // arduino-cli는 "폴더 이름 = .ino 이름"인 스케치 폴더를 요구한다.
  const work = join(cacheDir, hash);
  const sketchDir = join(work, "sketch");
  const outDir = join(work, "out");
  mkdirSync(sketchDir, { recursive: true });
  writeFileSync(join(sketchDir, "sketch.ino"), source);

  const r = await run(options.cli ?? "arduino-cli", [
    "compile",
    "--fqbn",
    fqbn,
    "--output-dir",
    outDir,
    sketchDir,
  ]);
  if (r.missing) {
    return {
      ok: false,
      issues: [
        {
          path: fileName,
          message:
            "arduino-cli를 찾을 수 없다. 설치: brew install arduino-cli (또는 https://arduino.github.io/arduino-cli)",
        },
      ],
    };
  }
  if (r.code !== 0) {
    const issues = parseCompilerErrors(r.output, fileName);
    return {
      ok: false,
      issues: issues.length ? issues : [{ path: fileName, message: r.output.trim().slice(-2000) }],
    };
  }
  const hex = readFileSync(join(outDir, "sketch.ino.hex"), "utf8");
  writeFileSync(cached, hex);
  return { ok: true, value: hex };
}
