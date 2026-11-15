/** 3D 뷰어: 조립된 부품을 three.js로 그린다. 장면 데이터는 `scene.ts`의 순수 함수가 만든다. */
import type { LoadedSystem } from "@physisim/core";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import {
  BoxGeometry,
  BufferGeometry,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Plane,
  Vector3,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Selection } from "../canvas/canvas.tsx";
import { activityOf, buildScene3d, type SceneBox, sceneBounds } from "./scene.ts";
import { type CaseMesh, downloadUrl, useCase } from "./use-case.ts";

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
function Orbit({ radius, target }: { radius: number; target: [number, number, number] }) {
  const { camera, gl } = useThree();
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
  useFrame(() =>
    (camera as { userData: { controls?: OrbitControls } }).userData.controls?.update(),
  );
  return null;
}

function Part({
  box,
  selected,
  activity,
  pressable,
  onSelect,
  onPress,
}: {
  box: SceneBox;
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
  return (
    <group position={box.position} rotation={rotation}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: three.js 객체이지 DOM 요소가 아니다 — r3f의 이벤트는 레이캐스트 이벤트다. */}
      <mesh
        geometry={geometry}
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
        onPointerOut={() => pressable && onPress("release")}
      >
        {/* 실치수는 채운 면, 자리표시(치수 가정)는 투명하게 — 가정을 실물처럼 보이게 하지 않는다.
            살아 있는 부품은 강조색으로 발광한다 (강조색은 살아 있는 것에만). */}
        <meshStandardMaterial
          color={selected ? ACCENT : (box.color ?? REAL)}
          emissive={ACCENT}
          emissiveIntensity={activity * 1.2}
          transparent={!box.real}
          opacity={box.real ? 1 : 0.18 + activity * 0.5}
          roughness={0.7}
        />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={selected || activity > 0 ? ACCENT : EDGE} />
      </lineSegments>
    </group>
  );
}

/** 케이스 메시(mm)를 장면 단위(m)로. 단면이 켜지면 중심 y 평면 앞쪽을 잘라 안을 보여 준다. */
function CaseSolid({
  mesh,
  color,
  clip,
}: {
  mesh: CaseMesh;
  color: string;
  clip: Plane | undefined;
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
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.55}
        roughness={0.8}
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
  const caseState = useCase(systemPath, showCase, loaded);
  const boxes = useMemo(() => buildScene3d(loaded), [loaded]);
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
  const gridSize = Math.ceil((extent * 3) / 0.01) * 0.01;
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
        gl={{ localClippingEnabled: true }}
        onPointerMissed={() => onSelect?.(undefined)}
      >
        <ambientLight intensity={0.9} />
        <directionalLight position={[0.2, -0.3, 0.5]} intensity={1.4} />
        <gridHelper
          args={[gridSize, Math.round(gridSize / 0.01), "#8a94a0", "#3a414b"]}
          rotation={[Math.PI / 2, 0, 0]}
          position={[center[0], center[1], floor]}
        />
        <Orbit radius={radius} target={target} />
        {boxes.map((b) => (
          <Part
            key={b.id}
            box={b}
            selected={selection?.kind === "part" && selection.id === b.id}
            activity={activityOf(b.id, signals)}
            pressable={running && b.switchable}
            onSelect={() => onSelect?.({ kind: "part", id: b.id })}
            onPress={(event) => onPress?.(b.id, event)}
          />
        ))}
        {data && <CaseSolid mesh={data.base} color="#9aa5b4" clip={clip} />}
        {data && <CaseSolid mesh={data.lid} color="#b8c1cd" clip={clip} />}
      </Canvas>
      <div className="float case-bar">
        <span className="seg">
          <button
            type="button"
            className={showCase ? "on" : ""}
            onClick={() => setShowCase((v) => !v)}
          >
            케이스
          </button>
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
