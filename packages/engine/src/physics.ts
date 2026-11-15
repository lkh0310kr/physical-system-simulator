/**
 * 강체 물리 어댑터 (P7-T7): Rapier(Apache-2.0, WASM)를 Domain Solver 뒤에 둔다.
 * 지금은 평면(바닥 위) 이동만 다룬다: 움직이는 몸체는 z가 고정이고 z축으로만 회전하며,
 * 정적 상자 장애물(벽)과 충돌한다. 중력은 쓰지 않는다 (바닥 접촉은 모델링하지 않는다).
 * 같은 입력이면 같은 결과 (Rapier는 결정론적이다).
 */
import RAPIER from "@dimforge/rapier3d-compat";

let ready: Promise<void> | undefined;

/** WASM을 한 번 초기화한다. 물리를 쓰는 시뮬레이션을 만들기 전에 기다려야 한다. */
export function initPhysics(): Promise<void> {
  ready ??= RAPIER.init();
  return ready;
}

let initialized = false;
void initPhysics().then(() => {
  initialized = true;
});
export const physicsReady = () => initialized;

export interface BoxSpec {
  /** 중심 위치 [m]. */
  readonly position: readonly [number, number, number];
  /** 전체 크기 [m]. */
  readonly size: readonly [number, number, number];
  /** z축 회전 [rad]. */
  readonly rotationZ: number;
}

export interface BodySpec extends BoxSpec {
  /** 질량 [kg]. */
  readonly mass: number;
}

export interface PlanarWorld {
  /** 움직이는 몸체를 더하고 핸들을 돌려 준다. */
  addBody(spec: BodySpec): number;
  /** 모든 몸체에 명령(속도)을 걸고 `dt`[s]만큼 진행한다. */
  step(dt: number, commands: ReadonlyMap<number, { speed: number; yawRate: number }>): void;
  /** 몸체의 월드 위치 [m]와 연속 방향 [rad]. */
  pose(handle: number): { x: number; y: number; heading: number };
  free(): void;
}

const quatZ = (angle: number) => ({ x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) });
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function createPlanarWorld(statics: readonly BoxSpec[]): PlanarWorld {
  if (!initialized) throw new Error("물리가 초기화되지 않았다: 먼저 `await initPhysics()`");
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  for (const b of statics) {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(b.size[0] / 2, b.size[1] / 2, b.size[2] / 2)
        .setTranslation(b.position[0], b.position[1], b.position[2])
        .setRotation(quatZ(b.rotationZ)),
    );
  }
  const bodies: { body: RAPIER.RigidBody; heading: number }[] = [];
  return {
    addBody(spec) {
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(spec.position[0], spec.position[1], spec.position[2])
          .setRotation(quatZ(spec.rotationZ))
          .enabledTranslations(true, true, false)
          .enabledRotations(false, false, true),
      );
      const volume = spec.size[0] * spec.size[1] * spec.size[2];
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(spec.size[0] / 2, spec.size[1] / 2, spec.size[2] / 2)
          .setDensity(spec.mass / Math.max(volume, 1e-9))
          .setFriction(0.2)
          .setRestitution(0),
        body,
      );
      bodies.push({ body, heading: spec.rotationZ });
      return bodies.length - 1;
    },
    step(dt, commands) {
      world.timestep = dt;
      for (const [handle, c] of commands) {
        const entry = bodies[handle];
        if (!entry) continue;
        const h = this.pose(handle).heading;
        entry.body.setLinvel({ x: c.speed * Math.cos(h), y: c.speed * Math.sin(h), z: 0 }, true);
        entry.body.setAngvel({ x: 0, y: 0, z: c.yawRate }, true);
      }
      world.step();
    },
    pose(handle) {
      const entry = bodies[handle];
      if (!entry) return { x: 0, y: 0, heading: 0 };
      const t = entry.body.translation();
      const q = entry.body.rotation();
      const raw = 2 * Math.atan2(q.z, q.w);
      // 감긴 값(−π~π)을 이어 붙여 연속 방향으로
      entry.heading += wrap(raw - entry.heading);
      return { x: t.x, y: t.y, heading: entry.heading };
    },
    free() {
      world.free();
    },
  };
}
