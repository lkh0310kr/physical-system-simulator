/** 3D 뷰어: 조립된 부품을 three.js로 그린다. 장면 데이터는 `scene.ts`의 순수 함수가 만든다. */
import type { LoadedSystem } from "@physisim/core";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import {
  ACESFilmicToneMapping,
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  type Group,
  Mesh,
  PCFShadowMap,
  Plane,
  PMREMGenerator,
  TubeGeometry,
  Vector3,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Selection } from "../canvas/canvas.tsx";
import {
  type AnimatedPose,
  activityOf,
  animatedPoses,
  buildCables,
  buildScene3d,
  explodeLifts,
  followPose,
  gridCell,
  type SceneBox,
  type SceneCable,
  type SceneMotion,
  type ScenePart,
  sceneBounds,
} from "./scene.ts";
import { type CaseData, type CaseMesh, downloadUrl, useCase } from "./use-case.ts";

const ACCENT = "#2f6bff";
const REAL = "#e4e8ee";
const EDGE = "#1d232b";

interface Props {
  readonly loaded: LoadedSystem;
  /** 실시간 시뮬레이션 신호 ("instance.output" → 값). */
  readonly signals?: Readonly<Record<string, unknown>>;
  /** 시뮬레이션이 돌고 있으면 스위치를 클릭으로 누른다. */
  readonly running?: boolean;
  readonly onPress?: (id: string, event: "press" | "release") => void;
  readonly selection?: Selection | undefined;
  readonly onSelect?: (s: Selection | undefined) => void;
  /** 열린 System 파일 경로 — 케이스 생성에 쓴다. */
  readonly systemPath?: string | undefined;
}

/** z가 위인 좌표계에서 궤도 카메라: 드래그 회전, 휠 확대, 우클릭 이동. 장면 크기에 맞춰 처음 거리를 잡는다. */
function Orbit({
  radius,
  target,
  follow,
}: {
  radius: number;
  target: [number, number, number];
  /** 움직이는 부품의 현재 위치. 주어지면 카메라가 같이 움직인다(보는 방향과 거리는 사용자가 정한 그대로). */
  follow: readonly number[] | undefined;
}) {
  const { camera, gl } = useThree();
  const last = useRef<readonly number[] | undefined>(undefined);
  useEffect(() => {
    camera.up.set(0, 0, 1);
    camera.position.set(
      target[0] + radius * 1.4,
      target[1] - radius * 1.8,
      target[2] + radius * 1.2,
    );
    camera.lookAt(...target);
    const controls = new OrbitControls(camera, gl.domElement);
    controls.target.set(...target);
    controls.enableDamping = true;
    controls.update();
    (camera as { userData: { controls?: OrbitControls } }).userData.controls = controls;
    return () => controls.dispose();
  }, [camera, gl, radius, target]);
  useFrame(() => {
    const controls = (camera as { userData: { controls?: OrbitControls } }).userData.controls;
    if (follow && last.current) {
      const d = [0, 1, 2].map((i) => (follow[i] ?? 0) - (last.current?.[i] ?? 0));
      camera.position.add(new Vector3(...(d as [number, number, number])));
      controls?.target.add(new Vector3(...(d as [number, number, number])));
    }
    last.current = follow;
    controls?.update();
  });
  return null;
}

/** 재질 분류별 PBR 값. 형상 데이터에는 분류만 두고 셰이더 값은 여기서 정한다. */
const MATERIALS = {
  pcb: { color: "#171b21", roughness: 0.55, metalness: 0.1 },
  metal: { color: "#c3c9d1", roughness: 0.28, metalness: 0.95 },
  plastic: { color: "#2a2f38", roughness: 0.55, metalness: 0 },
  glass: { color: "#1a2233", roughness: 0.05, metalness: 0.2 },
  rubber: { color: "#1b1d20", roughness: 0.9, metalness: 0 },
} as const;

function PartMaterial({ part, glow }: { part: ScenePart; glow: number }) {
  const m = MATERIALS[part.material];
  return (
    <meshPhysicalMaterial
      color={part.color ?? m.color}
      roughness={m.roughness}
      metalness={m.metalness}
      clearcoat={part.material === "glass" ? 1 : 0}
      emissive={ACCENT}
      emissiveIntensity={glow}
    />
  );
}

/** 세부 형상 하나. 원기둥은 three의 기본 y축을 요청한 축으로 눕힌다. */
function Shape({
  part,
  glow,
  signals,
  id,
}: {
  part: ScenePart;
  glow: number;
  signals: Readonly<Record<string, unknown>>;
  id: string;
}) {
  const geometry = useMemo(
    () =>
      part.kind === "box"
        ? new BoxGeometry(...part.size)
        : new CylinderGeometry(part.diameter / 2, part.diameter / 2, part.length, 40),
    [part],
  );
  // 신호를 따라 움직이는 부품: 평행 이동(눌리는 플런저)과 축 회전(바퀴·관절). 회전 목록은 안쪽 관절부터.
  const signalValue = (signal: string) => Number(signals[`${id}.${signal}`] ?? 0);
  const shift: [number, number, number] = [0, 0, 0];
  for (const m of part.motions) {
    if (m.kind !== "translate") continue;
    shift[m.axis === "x" ? 0 : m.axis === "y" ? 1 : 2] += signalValue(m.signal) * m.distance;
  }
  const position: [number, number, number] = [
    part.position[0] + shift[0],
    part.position[1] + shift[1],
    part.position[2] + shift[2],
  ];
  const shapeRotation: [number, number, number] =
    part.kind === "cylinder"
      ? part.axis === "z"
        ? [Math.PI / 2, 0, 0]
        : part.axis === "x"
          ? [0, 0, Math.PI / 2]
          : [0, 0, 0]
      : [0, 0, 0];
  const rotations = part.motions.filter(
    (m): m is Extract<SceneMotion, { kind: "rotate" }> => m.kind === "rotate",
  );
  const mesh = (at: readonly number[]) => (
    <mesh
      geometry={geometry}
      position={[
        position[0] - (at[0] ?? 0),
        position[1] - (at[1] ?? 0),
        position[2] - (at[2] ?? 0),
      ]}
      rotation={shapeRotation}
      castShadow
      receiveShadow
    >
      <PartMaterial part={part} glow={glow} />
    </mesh>
  );
  if (rotations.length === 0) return mesh([0, 0, 0]);
  // 안쪽 회전부터 바깥쪽 그룹으로 감싼다: 바깥 그룹이 안쪽 그룹 전체를 돌린다
  const pivots = rotations.map((m) => m.pivot ?? part.position);
  let node = mesh(pivots[0] ?? part.position);
  rotations.forEach((m, i) => {
    const pivot = pivots[i] ?? part.position;
    const parent = pivots[i + 1] ?? [0, 0, 0];
    const spin: [number, number, number] = [
      m.axis === "x" ? signalValue(m.signal) * m.scale : 0,
      m.axis === "y" ? signalValue(m.signal) * m.scale : 0,
      m.axis === "z" ? signalValue(m.signal) * m.scale : 0,
    ];
    // i번째 그룹은 자기 pivot에서 돌고, 위치는 바깥 pivot 기준 (바깥이 없으면 월드 기준)
    node = (
      <group
        position={[
          pivot[0] - (parent[0] ?? 0),
          pivot[1] - (parent[1] ?? 0),
          pivot[2] - (parent[2] ?? 0),
        ]}
        rotation={spin}
      >
        {node}
      </group>
    );
  });
  return node;
}

/** glb를 한 번만 읽어 캐시한다. 실패하면 undefined(→ 세부 형상으로 대체). 날카로운 모서리는 살리고 곡면만 부드럽게 한다. */
const glbCache = new Map<string, Promise<Group | undefined>>();
function useGlb(url: string | undefined): Group | undefined {
  const [group, setGroup] = useState<Group | undefined>();
  useEffect(() => {
    if (!url) return setGroup(undefined);
    let cancelled = false;
    let p = glbCache.get(url);
    if (!p) {
      p = new GLTFLoader()
        .loadAsync(url)
        .then((g) => {
          g.scene.traverse((o) => {
            if (o instanceof Mesh) {
              o.geometry = toCreasedNormals(o.geometry, Math.PI / 6);
              o.castShadow = true;
              o.receiveShadow = true;
            }
          });
          return g.scene as Group;
        })
        .catch(() => undefined);
      glbCache.set(url, p);
    }
    p.then((g) => !cancelled && setGroup(g));
    return () => {
      cancelled = true;
    };
  }, [url]);
  return group;
}

function Part({
  box,
  selected,
  activity,
  burnt,
  signals,
  pose,
  pressable,
  onSelect,
  onPress,
}: {
  box: SceneBox;
  signals: Readonly<Record<string, unknown>>;
  /** 움직이는 부품의 현재 자세 (없으면 정적 배치). */
  pose: AnimatedPose | undefined;
  /** 소손된 부품(고장): 어둡게 탄 색으로 보인다. */
  burnt: boolean;
  selected: boolean;
  /** 0~1: 시뮬레이션에서 이 부품이 "살아 있는" 정도 (발광 세기). */
  activity: number;
  pressable: boolean;
  onSelect: () => void;
  onPress: (event: "press" | "release") => void;
}) {
  const geometry = useMemo(() => new BoxGeometry(...box.size), [box.size]);
  const edges = useMemo(() => new EdgesGeometry(geometry), [geometry]);
  const rotation = box.rotation.map((d) => (d * Math.PI) / 180) as [number, number, number];
  const glbSource = useGlb(box.mesh);
  // 렌더마다 장면을 복제하면 프레임마다 객체가 새로 만들어진다 — 원본이 바뀔 때만 복제
  const glb = useMemo(() => glbSource?.clone(), [glbSource]);
  const detailed = glb !== undefined || box.parts.length > 0;
  const [hover, setHover] = useState(false);
  const glow = activity + (hover ? 0.3 : 0);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: three.js 객체이지 DOM 요소가 아니다 — r3f의 이벤트는 레이캐스트 이벤트다.
    <group
      position={pose?.position ?? box.position}
      rotation={[rotation[0], rotation[1], rotation[2] + (pose?.heading ?? 0)]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerDown={(e) => {
        if (!pressable) return;
        e.stopPropagation();
        onPress("press");
      }}
      onPointerUp={() => pressable && onPress("release")}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = "";
        if (pressable) onPress("release");
      }}
    >
      {glb ? (
        <primitive object={glb} />
      ) : detailed ? (
        box.parts.map((p) => (
          <Shape key={p.name} part={p} glow={glow * 0.35} signals={signals} id={box.id} />
        ))
      ) : (
        <mesh geometry={geometry} castShadow receiveShadow>
          {/* 실치수는 채운 면, 자리표시(치수 가정)는 투명하게 — 가정을 실물처럼 보이게 하지 않는다.
              살아 있는 부품은 강조색으로 발광한다 (강조색은 살아 있는 것에만). */}
          <meshStandardMaterial
            color={burnt ? "#3a2724" : selected ? ACCENT : (box.color ?? REAL)}
            emissive={ACCENT}
            emissiveIntensity={glow * 1.2}
            transparent={!box.real}
            opacity={box.real ? 1 : 0.18 + activity * 0.5}
            roughness={0.6}
            metalness={0.05}
          />
        </mesh>
      )}
      {/* 세부 형상이 있으면 박스는 안 그리고, 선택·활성일 때만 바깥 윤곽을 강조색으로 보인다 */}
      {(!detailed || selected || activity > 0) && (
        <lineSegments geometry={edges}>
          <lineBasicMaterial color={selected || activity > 0 ? ACCENT : EDGE} />
        </lineSegments>
      )}
    </group>
  );
}

/** 이미지 기반 조명: 방 모양 장면을 PMREM으로 만들어 금속 반사와 부드러운 채움광을 낸다 (외부 파일·의존성 없음). */
/** 부품 이름표: 부품 위쪽 점을 화면 좌표로 투영해 DOM 라벨을 움직인다 (장면 안에 글자를 그리지 않는다). */
function LabelProjector({
  boxes,
  labels,
  lifts,
  poses,
}: {
  boxes: readonly SceneBox[];
  labels: RefObject<(HTMLElement | null)[]>;
  lifts: ReadonlyMap<string, number>;
  poses: ReadonlyMap<string, AnimatedPose>;
}) {
  const { camera, gl } = useThree();
  const v = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const w = gl.domElement.clientWidth;
    const h = gl.domElement.clientHeight;
    boxes.forEach((b, i) => {
      const el = labels.current?.[i];
      if (!el) return;
      const p = poses.get(b.id)?.position ?? b.position;
      v.set(p[0], p[1], p[2] + b.size[2] / 2 + (lifts.get(b.id) ?? 0)).project(camera);
      const visible = v.z < 1;
      el.style.display = visible ? "block" : "none";
      el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -140%)`;
    });
  });
  return null;
}

/** 전선: 두 핀을 잇는 곡선. 각 끝은 먼저 부품 박스 바깥까지 옆으로 빠져나온 뒤 이어져, 부품을 파고들지 않는다. */
function Cable({
  cable,
  fromLift,
  toLift,
  fromPose,
  toPose,
}: {
  cable: SceneCable;
  /** 끝점 부품의 움직임 (없으면 정적 배치). */
  fromPose: AnimatedPose | undefined;
  toPose: AnimatedPose | undefined;
  fromLift: number;
  toLift: number;
}) {
  const geometry = useMemo(() => {
    const margin = 0.0015;
    /** 핀에서 부품 중심 반대쪽(수평)으로 박스 밖까지 나간 점. 수평 성분이 없으면 위로. */
    const exit = (p: readonly number[], c: readonly number[], h: readonly number[]) => {
      const dx = (p[0] ?? 0) - (c[0] ?? 0);
      const dy = (p[1] ?? 0) - (c[1] ?? 0);
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) return new Vector3(p[0], p[1], (p[2] ?? 0) + 0.004);
      const ux = dx / len;
      const uy = dy / len;
      const t = Math.min(
        Math.abs(ux) > 1e-6 ? (h[0] ?? 0) / Math.abs(ux) : Infinity,
        Math.abs(uy) > 1e-6 ? (h[1] ?? 0) / Math.abs(uy) : Infinity,
      );
      return new Vector3((c[0] ?? 0) + ux * (t + margin), (c[1] ?? 0) + uy * (t + margin), p[2]);
    };
    const up = (p: readonly number[], l: number): [number, number, number] => [
      p[0] ?? 0,
      p[1] ?? 0,
      (p[2] ?? 0) + l,
    ];
    const fromC = followPose(cable.fromCenter, cable.fromCenter, fromPose);
    const toC = followPose(cable.toCenter, cable.toCenter, toPose);
    const from = up(followPose(cable.from, cable.fromCenter, fromPose), fromLift);
    const to = up(followPose(cable.to, cable.toCenter, toPose), toLift);
    const a = new Vector3(...from);
    const b = new Vector3(...to);
    const a1 = exit(from, up(fromC, fromLift), cable.fromHalf);
    const b1 = exit(to, up(toC, toLift), cable.toHalf);
    const mid = a1.clone().add(b1).multiplyScalar(0.5);
    mid.z -= 0.0015;
    const curve = new CatmullRomCurve3([a, a1, mid, b1, b], false, "catmullrom", 0.5);
    return new TubeGeometry(curve, 64, 0.0004, 8, false);
  }, [cable, fromLift, toLift, fromPose, toPose]);
  return (
    <mesh geometry={geometry} castShadow>
      <meshStandardMaterial color={cable.ground ? "#16181c" : "#c0392b"} roughness={0.6} />
    </mesh>
  );
}

/** 서버가 준 메시(mm)를 장면 단위(m)의 BufferGeometry로. */
function meshGeometry(mesh: CaseMesh): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute(
    "position",
    new Float32BufferAttribute(
      mesh.positions.map((v) => v / 1000),
      3,
    ),
  );
  g.setIndex(mesh.indices);
  g.computeVertexNormals();
  return g;
}

/** 출력 배치: 베드(바닥) 위에 베이스와 뒤집은 뚜껑을 장면 중심에 놓는다. */
function PrintPlate({
  data,
  center,
  floor,
}: {
  data: CaseData;
  center: readonly number[];
  floor: number;
}) {
  const parts = useMemo(
    () => [meshGeometry(data.print.base), meshGeometry(data.print.lid)],
    [data],
  );
  // 두 부품을 합친 x·y 중심이 장면 중심에 오도록 옮긴다
  const offset = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const m of [data.print.base, data.print.lid])
      for (let i = 0; i < m.positions.length; i += 3) {
        xs.push(m.positions[i] ?? 0);
        ys.push(m.positions[i + 1] ?? 0);
      }
    const mid = (a: number[]) =>
      (a.reduce((x, y) => Math.min(x, y), Infinity) +
        a.reduce((x, y) => Math.max(x, y), -Infinity)) /
      2;
    return [(center[0] ?? 0) - mid(xs) / 1000, (center[1] ?? 0) - mid(ys) / 1000, floor];
  }, [data, center, floor]);
  return (
    <group position={[offset[0] ?? 0, offset[1] ?? 0, offset[2] ?? 0]}>
      {parts.map((g, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 고정 두 개(베이스, 뚜껑)
        <mesh key={i} geometry={g} castShadow receiveShadow>
          <meshPhysicalMaterial color={i === 0 ? "#9aa5b4" : "#b8c1cd"} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = texture;
    return () => {
      scene.environment = null;
      texture.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

/** 케이스 메시(mm)를 장면 단위(m)로. 단면이 켜지면 중심 y 평면 앞쪽을 잘라 안을 보여 준다. */
function CaseSolid({
  mesh,
  color,
  clip,
  lift = 0,
}: {
  mesh: CaseMesh;
  color: string;
  clip: Plane | undefined;
  /** 분해 보기에서 위로 띄우는 높이 [m]. */
  lift?: number;
}) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute(
      "position",
      new Float32BufferAttribute(
        mesh.positions.map((v) => v / 1000),
        3,
      ),
    );
    g.setIndex(mesh.indices);
    g.computeVertexNormals();
    return g;
  }, [mesh]);
  return (
    <mesh geometry={geometry} position={[0, 0, lift]}>
      <meshPhysicalMaterial
        color={color}
        transparent
        opacity={0.5}
        roughness={0.45}
        clearcoat={0.4}
        side={DoubleSide}
        clippingPlanes={clip ? [clip] : []}
      />
    </mesh>
  );
}

export function Viewer3D({
  loaded,
  signals = {},
  running = false,
  onPress,
  selection,
  onSelect,
  systemPath,
}: Props) {
  const [showCase, setShowCase] = useState(false);
  const [section, setSection] = useState(false);
  /** 분해 보기 0~1: 뚜껑과 부품을 위로 벌려 안쪽 구성을 보여 준다. */
  const [explode, setExplode] = useState(0);
  /** 출력 배치 보기: 부품은 숨기고 베이스·뚜껑을 출력 자세로 나란히 보여 준다. */
  const [printView, setPrintView] = useState(false);
  const labels = useRef<(HTMLElement | null)[]>([]);
  const caseState = useCase(systemPath, showCase, loaded);
  const all = useMemo(() => buildScene3d(loaded), [loaded]);
  // 케이스를 보는 동안은 치수 없는 자리표시를 숨긴다 — 케이스에 들어가지 않는 가정 크기가 섞여 보이지 않게
  const boxes = useMemo(() => (showCase ? all.filter((b) => b.real) : all), [all, showCase]);
  const parents = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(loaded.doc.assembly ?? {}).map(([id, p]) => [id, p.parent]),
      ),
    [loaded],
  );
  const poses = useMemo(() => animatedPoses(boxes, parents, signals), [boxes, parents, signals]);
  // 스스로 자세 신호(x·y·heading)를 내는 부품이 있으면 카메라가 따라간다
  const followPos = useMemo(
    () =>
      boxes
        .filter((b) => typeof signals[`${b.id}.heading`] === "number")
        .map((b) => poses.get(b.id)?.position)[0],
    [boxes, signals, poses],
  );
  // 케이블은 표시 중인 부품 사이만, 이미 만든 장면 데이터로 계산한다
  const cablesAll = useMemo(
    () =>
      buildCables(loaded, boxes).filter(
        (c) => boxes.some((b) => b.id === c.fromId) && boxes.some((b) => b.id === c.toId),
      ),
    [loaded, boxes],
  );
  const lifts = useMemo(() => explodeLifts(boxes, explode), [boxes, explode]);
  const lidLift = Math.max(0, ...lifts.values()) + 0.008 * explode;
  const bounds = useMemo(() => sceneBounds(boxes), [boxes]);
  const center: [number, number, number] = bounds
    ? [
        (bounds[0][0] + bounds[1][0]) / 2,
        (bounds[0][1] + bounds[1][1]) / 2,
        (bounds[0][2] + bounds[1][2]) / 2,
      ]
    : [0, 0, 0];
  const radius = bounds
    ? Math.max(0.03, Math.hypot(bounds[1][0] - bounds[0][0], bounds[1][1] - bounds[0][1]) / 2)
    : 0.05;
  // 격자는 장면 크기에 맞춰 10 mm 칸으로, 부품 아래(z = 바닥)에 둔다.
  const extent = bounds
    ? Math.max(bounds[1][0] - bounds[0][0], bounds[1][1] - bounds[0][1], 0.04)
    : 0.04;
  const cell = gridCell(extent);
  const gridSize = Math.ceil((extent * 3) / cell) * cell;
  const floor = bounds ? bounds[0][2] : 0;
  const targetKey = center.join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: 값이 같으면 같은 target 배열을 쓰도록 키로 고정한다.
  const target = useMemo(() => center, [targetKey]);
  const clip = useMemo(
    () => (section ? new Plane(new Vector3(0, 1, 0), -center[1]) : undefined),
    [section, center[1]],
  );
  const data = caseState.status === "ready" ? caseState.data : undefined;

  return (
    // r3f 래퍼는 height: 100%라서 높이가 있는 부모가 필요하다 — 전체 화면 컨테이너로 감싼다.
    <div className="view3d">
      <Canvas
        className="view3d"
        camera={{ fov: 40, near: 0.001, far: 5 }}
        shadows={{ type: PCFShadowMap }}
        gl={{ localClippingEnabled: true, toneMapping: ACESFilmicToneMapping }}
        onPointerMissed={() => onSelect?.(undefined)}
      >
        <Environment />
        <ambientLight intensity={0.25} />
        <directionalLight
          position={[center[0] + 0.08, center[1] - 0.1, floor + 0.2]}
          intensity={2.2}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0004}
          shadow-camera-left={-0.1}
          shadow-camera-right={0.1}
          shadow-camera-top={0.1}
          shadow-camera-bottom={-0.1}
          shadow-camera-near={0.01}
          shadow-camera-far={0.6}
          target-position={[center[0], center[1], floor]}
        />
        {/* 바닥 그림자: 부품이 떠 보이지 않게 한다 */}
        <mesh position={[center[0], center[1], floor - 0.00005]} receiveShadow>
          <planeGeometry args={[gridSize, gridSize]} />
          <shadowMaterial opacity={0.35} />
        </mesh>
        <gridHelper
          args={[gridSize, Math.round(gridSize / cell), "#8a94a0", "#3a414b"]}
          rotation={[Math.PI / 2, 0, 0]}
          position={[center[0], center[1], floor]}
        />
        <Orbit radius={radius} target={target} follow={followPos} />
        <LabelProjector boxes={boxes} labels={labels} lifts={lifts} poses={poses} />
        {!printView &&
          boxes.map((b) => (
            <group key={b.id} position={[0, 0, lifts.get(b.id) ?? 0]}>
              <Part
                key={b.id}
                box={b}
                selected={selection?.kind === "part" && selection.id === b.id}
                activity={activityOf(b.id, signals)}
                burnt={signals[`${b.id}.burnt`] === true}
                signals={signals}
                pose={poses.get(b.id)}
                pressable={running && b.switchable}
                onSelect={() => onSelect?.({ kind: "part", id: b.id })}
                onPress={(event) => onPress?.(b.id, event)}
              />
            </group>
          ))}
        {!printView &&
          cablesAll.map((c) => (
            <Cable
              key={c.id}
              cable={c}
              fromLift={lifts.get(c.fromId) ?? 0}
              toLift={lifts.get(c.toId) ?? 0}
              fromPose={poses.get(c.fromId)}
              toPose={poses.get(c.toId)}
            />
          ))}
        {data && !printView && <CaseSolid mesh={data.base} color="#9aa5b4" clip={clip} />}
        {data && printView && <PrintPlate data={data} center={center} floor={floor} />}
        {data && !printView && (
          <CaseSolid mesh={data.lid} color="#b8c1cd" clip={clip} lift={lidLift} />
        )}
      </Canvas>
      {!printView &&
        boxes.map((b, i) => (
          <span
            key={b.id}
            className="part-label"
            ref={(el) => {
              labels.current[i] = el;
            }}
          >
            {b.real ? b.id : `${b.id} · 가정 크기`}
            {signals[`${b.id}.burnt`] === true ? " · 소손" : ""}
          </span>
        ))}
      <div className="float case-bar">
        <span className="seg">
          <button
            type="button"
            className={showCase ? "on" : ""}
            onClick={() => setShowCase((v) => !v)}
          >
            케이스
          </button>
          {
            <input
              type="range"
              className="explode"
              aria-label="분해"
              min={0}
              max={1}
              step={0.01}
              value={explode}
              onChange={(e) => setExplode(Number(e.target.value))}
            />
          }
          {showCase && (
            <button
              type="button"
              className={printView ? "on" : ""}
              onClick={() => setPrintView((v) => !v)}
            >
              출력 배치
            </button>
          )}
          {showCase && (
            <button
              type="button"
              className={section ? "on" : ""}
              onClick={() => setSection((v) => !v)}
            >
              단면
            </button>
          )}
        </span>
        {caseState.status === "loading" && <span className="muted">만드는 중…</span>}
        {caseState.status === "error" && <span className="muted">{caseState.message}</span>}
        {data && systemPath && (
          <>
            <span className={data.ok ? "muted" : "case-bad"}>
              {data.ok
                ? `검증 통과${data.issues.length ? ` · 경고 ${data.issues.length}` : ""}`
                : `검증 실패 ${data.issues.filter((i) => i.severity === "error").length}`}
            </span>
            {data.ok &&
              (["3mf", "base", "lid", "bom"] as const).map((f) => (
                <a key={f} className="pill" href={downloadUrl(systemPath, f)} download>
                  {f === "3mf" ? "3MF" : f === "bom" ? "BOM" : `${f.toUpperCase()} STL`}
                </a>
              ))}
          </>
        )}
      </div>
      {data && data.issues.length > 0 && (
        <ul className="float case-issues">
          {data.issues.map((i) => (
            <li key={`${i.code}-${i.message}`} className={i.severity}>
              {i.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
