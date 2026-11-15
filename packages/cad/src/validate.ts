/**
 * 케이스 검증 (P7-T17): 만든 케이스가 **실제로 제작·조립 가능한지**를 형상에서 직접 확인한다.
 * error가 하나라도 있으면 산출물을 내보내지 않는다. warning은 사람이 보고 판단할 항목이다.
 */
import type { CaseGeometry, CaseInput } from "./case.ts";
import { skirtOf, tongueOf } from "./case.ts";
import { box, inspect, loadGeometry } from "./geometry.ts";
import { solidsOfGlb } from "./glb.ts";
import type { ProcessProfile } from "./process.ts";

export interface CaseIssue {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
}

/** 플러그가 깊은 통로 끝까지 닿는지 의심하는 길이 [mm]. 일반 경험치(가정). */
const DEEP_TUNNEL = 6;
/** 막힌 구멍으로 보기 시작하는 길이/지름 비 (핀 도구용 구멍). 일반 경험치(가정). */
const DEEP_RATIO = 5;
/** 개구부 기준점이 부품 상자에서 이만큼(mm) 벗어나도 부품 위로 본다. */
const MOUNT_SLACK = 0.5;

export interface ValidateOptions {
  /** 형상 파일 이름 → glb 내용. 주면 박스가 아니라 실제 형상으로도 간섭을 검사한다. */
  readonly readMesh?: (file: string) => Uint8Array | undefined;
}

/** 실제 형상이 케이스와 이만큼(mm³) 넘게 겹치면 거부한다. 메시 삼각분할 오차를 넘기는 값. */
const MESH_OVERLAP = 0.5;

export async function validateCase(
  input: CaseInput,
  g: CaseGeometry,
  profile: ProcessProfile,
  options: ValidateOptions = {},
): Promise<CaseIssue[]> {
  const m = await loadGeometry();
  const issues: CaseIssue[] = [];
  const err = (code: string, message: string) => issues.push({ severity: "error", code, message });
  const warn = (code: string, message: string) =>
    issues.push({ severity: "warning", code, message });

  for (const p of input.problems) err("opening-axis", p);

  // 1. 닫힌 입체이고 한 덩어리인가
  for (const [name, solid] of [
    ["베이스", g.base],
    ["뚜껑", g.lid],
  ] as const) {
    const r = inspect(solid);
    if (!r.closed) err("not-closed", `${name}가 닫힌 입체가 아니다 (${r.status})`);
    else if (r.components !== 1)
      err(
        "split-body",
        `${name}가 ${r.components}조각으로 나뉘었다 (개구부가 벽을 갈랐을 수 있다)`,
      );
  }

  // 1b. 뚜껑을 닫았을 때 베이스와 겹치지 않는가 (돌기가 홈에 들어가는지 포함)
  const clash = g.base.intersect(g.lid).volume();
  if (clash > 1e-6)
    err("lid-clash", `뚜껑이 베이스와 ${clash.toFixed(3)} mm³ 겹친다 — 닫히지 않는다`);

  // 2. 벽·판 두께
  const walls: [string, number][] = [
    ["벽", profile.wall],
    ["바닥·윗판", profile.plate],
    ["혀(tongue)", tongueOf(profile)],
    ["뚜껑 치마", skirtOf(profile)],
  ];
  for (const [name, t] of walls) {
    if (t + 1e-9 < profile.minWall)
      err("thin-wall", `${name} 두께 ${t.toFixed(2)} mm < 최소 ${profile.minWall} mm`);
  }

  // 3. 부품이 케이스 입체와 겹치지 않는가 (공동 안에 들어가는가)
  const shell = g.base.add(g.lid);
  for (const p of input.parts) {
    const v = shell.intersect(box(m, p.min, p.max)).volume();
    if (v > 1e-6) err("interference", `부품 ${p.id}가 케이스와 ${v.toFixed(2)} mm³ 겹친다`);
  }

  // 3b. 제작사 형상으로 정밀 간섭 (박스 검사는 통과해도 실제 형상이 닿는지는 다르다)
  const exact: string[] = [];
  for (const p of input.parts) {
    if (!p.mesh) continue;
    const data = options.readMesh?.(p.mesh.file);
    if (!data) {
      warn("mesh-missing", `부품 ${p.id}: 형상 파일 ${p.mesh.file}을 못 읽어 박스로만 검사했다`);
      continue;
    }
    const solids = await solidsOfGlb(data);
    exact.push(p.id);
    const [rx, ry, rz] = p.mesh.rotation;
    for (const s of solids) {
      const placed = s
        .rotate([0, 0, rz])
        .rotate([0, ry, 0])
        .rotate([rx, 0, 0])
        .translate([...p.mesh.position] as [number, number, number]);
      const v = shell.intersect(placed).volume();
      if (v > MESH_OVERLAP)
        err("mesh-interference", `부품 ${p.id}의 실제 형상이 케이스와 ${v.toFixed(2)} mm³ 겹친다`);
    }
  }

  // 4. 개구부
  for (const { opening: o, solid } of g.cutters) {
    const label = `${o.part}.${o.mount}`;
    const owner = input.parts.find((p) => p.id === o.part);
    const [u, v] = [0, 1, 2].filter((k) => k !== o.axis) as [number, number];
    const size = o.size.map((s) => s + 2 * profile.openingClearance) as [number, number];

    if (owner) {
      const inside = o.position.every(
        (c, i) => c >= (owner.min[i] ?? 0) - MOUNT_SLACK && c <= (owner.max[i] ?? 0) + MOUNT_SLACK,
      );
      if (!inside) err("opening-off-part", `${label}: 개구부 기준점이 부품 상자 밖에 있다`);
    }
    if (Math.min(...size) + 1e-9 < profile.minHole)
      err(
        "small-hole",
        `${label}: 구멍 ${Math.min(...size).toFixed(2)} mm < 최소 ${profile.minHole} mm`,
      );

    // 벽을 실제로 뚫는가
    const cut = g.uncut.base.add(g.uncut.lid).intersect(solid).volume();
    if (cut < 1e-6) err("opening-misses-wall", `${label}: 통로가 케이스 벽과 만나지 않는다`);

    // 통로가 다른 부품에 막히지 않는가
    for (const p of input.parts) {
      if (p.id === o.part) continue;
      if (solid.intersect(box(m, p.min, p.max)).volume() > 1e-6)
        err("opening-blocked", `${label}: 통로가 부품 ${p.id}에 막힌다`);
    }

    // 구멍 둘레에 minWall 이상 남는가
    const centers = [o.position[u] ?? 0, o.position[v] ?? 0];
    for (const [i, k] of ([u, v] as const).entries()) {
      const half = (size[i] ?? 0) / 2;
      const margin = Math.min(
        (centers[i] ?? 0) - half - (g.outer.min[k] ?? 0),
        (g.outer.max[k] ?? 0) - ((centers[i] ?? 0) + half),
      );
      if (margin + 1e-9 < profile.minWall)
        err(
          "opening-edge",
          `${label}: 구멍과 케이스 가장자리 사이 ${margin.toFixed(2)} mm < 최소 ${profile.minWall} mm`,
        );
    }

    // 사람이 판단할 항목
    const outerFace = o.sign > 0 ? g.outer.max[o.axis] : g.outer.min[o.axis];
    const tunnel = Math.abs(outerFace - (o.position[o.axis] ?? 0));
    const minSide = Math.min(...size);
    if (o.shape === "rect" && tunnel > DEEP_TUNNEL)
      warn(
        "deep-tunnel",
        `${label}: 부품에서 바깥까지 ${tunnel.toFixed(1)} mm — 플러그가 닿는지 확인`,
      );
    if (o.shape === "round" && tunnel / minSide > DEEP_RATIO)
      warn(
        "deep-hole",
        `${label}: 깊이 ${tunnel.toFixed(1)} mm, 지름 ${minSide.toFixed(1)} mm — 핀·클립 같은 긴 도구로만 닿는다`,
      );
    if (o.axis !== 2 && (size[0] ?? 0) > profile.bridgeLimit)
      warn(
        "bridge",
        `${label}: 벽을 가로지르는 구멍 폭 ${(size[0] ?? 0).toFixed(1)} mm > 브리지 한계 ${profile.bridgeLimit} mm — 윗면이 처질 수 있다`,
      );
  }

  for (const m of g.merged)
    warn("opening-merged", `가까운 구멍을 하나로 합쳤다: ${m} (사이 벽이 최소 벽 두께보다 얇음)`);

  // 4b. 같은 벽의 구멍끼리 사이 벽이 minWall 이상인가
  const faceRect = (o: CaseGeometry["openings"][number]) => {
    const [u, v] = [0, 1, 2].filter((k) => k !== o.axis) as [number, number];
    const w = o.size[0] + 2 * profile.openingClearance;
    const h = o.size[1] + 2 * profile.openingClearance;
    return {
      u: [(o.position[u] ?? 0) - w / 2, (o.position[u] ?? 0) + w / 2] as const,
      v: [(o.position[v] ?? 0) - h / 2, (o.position[v] ?? 0) + h / 2] as const,
    };
  };
  for (const [i, a] of g.openings.entries()) {
    for (const b of g.openings.slice(i + 1)) {
      if (a.axis !== b.axis || a.sign !== b.sign) continue;
      const ra = faceRect(a);
      const rb = faceRect(b);
      const gap = (x: readonly [number, number], y: readonly [number, number]) =>
        Math.max(x[0] - y[1], y[0] - x[1]);
      const web = Math.max(gap(ra.u, rb.u), gap(ra.v, rb.v));
      if (web + 1e-9 < profile.minWall)
        err(
          "opening-spacing",
          `${a.part}.${a.mount}와 ${b.part}.${b.mount} 사이 벽 ${Math.max(0, web).toFixed(2)} mm < 최소 ${profile.minWall} mm`,
        );
    }
  }

  // 5. 출력 크기: 각 부품이 한 번에 출력되는가 (축을 돌려 맞추는 것 허용)
  const fits = (dims: number[]) => {
    const a = [...dims].sort((x, y) => x - y);
    const b = [...profile.buildVolume].sort((x, y) => x - y);
    return a.every((d, i) => d <= (b[i] ?? 0));
  };
  for (const [name, solid] of [
    ["베이스", g.base],
    ["뚜껑", g.lid],
  ] as const) {
    const r = inspect(solid);
    const dims = [0, 1, 2].map((i) => (r.max[i] ?? 0) - (r.min[i] ?? 0));
    if (!fits(dims))
      err(
        "build-volume",
        `${name} ${dims.map((d) => d.toFixed(1)).join("×")} mm가 출력 가능 크기를 넘는다`,
      );
  }
  return issues;
}

export const hasErrors = (issues: readonly CaseIssue[]) =>
  issues.some((i) => i.severity === "error");
