/**
 * 4축 팔(+그리퍼)의 기구학 (순수 함수, SI).
 * 평면(r, h): 어깨 축에서 위쪽 h, 바깥쪽 r. 각도는 모두 수직 위에서 앞(+r)쪽으로 기울이는 방향이 +.
 *   어깨 θ2: 위팔의 수직 대비 기울기, 팔꿈치 θ3: 위팔 대비 아래팔 굽힘, 손목 θ4: 아래팔 대비 그리퍼 굽힘.
 *   그리퍼 방향각 φ = θ2 + θ3 + θ4 + π/2 (손목 서보를 90° 돌려 단 구조: 명령 0이면 그리퍼가 앞쪽 수평).
 *   φ = π이면 그리퍼가 수직 아래를 향한다.
 * 베이스 θ1은 수직축 회전(위에서 보아 반시계 +).
 */
export interface ArmGeometry {
  /** 바닥에서 어깨 축까지 높이. */
  readonly baseHeight: number;
  readonly link1: number;
  readonly link2: number;
  /** 손목 축에서 그리퍼 끝(집는 점)까지. */
  readonly gripper: number;
}

export interface JointAngles {
  readonly base: number;
  readonly shoulder: number;
  readonly elbow: number;
  readonly wrist: number;
}

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** 순기구학: 관절 각도 → 그리퍼 끝 위치. */
export function forward(g: ArmGeometry, q: JointAngles): Point3 {
  const a2 = q.shoulder;
  const a3 = q.shoulder + q.elbow;
  const phi = a3 + q.wrist + Math.PI / 2;
  const r = g.link1 * Math.sin(a2) + g.link2 * Math.sin(a3) + g.gripper * Math.sin(phi);
  const z =
    g.baseHeight + g.link1 * Math.cos(a2) + g.link2 * Math.cos(a3) + g.gripper * Math.cos(phi);
  return { x: r * Math.cos(q.base), y: r * Math.sin(q.base), z };
}

export interface IkResult {
  readonly angles: JointAngles;
  /** 목표가 팔이 닿는 범위이고 모든 관절이 한계 안인지. */
  readonly reachable: boolean;
}

/**
 * 역기구학: 그리퍼를 수직 아래로 향한 채 끝을 (x, y, z)에 둔다. 팔꿈치는 아래팔이 앞으로 굽는 해(θ3 ≥ 0)를 고른다.
 * 닿지 않으면 가장 가까운 자세(팔을 쭉 폄)로 두고 `reachable: false`.
 * @param limit 관절 한계 ±[rad] (서보 총 가동 각도의 절반)
 */
export function inverse(g: ArmGeometry, target: Point3, limit = Math.PI / 2): IkResult {
  const base = Math.hypot(target.x, target.y) < 1e-9 ? 0 : Math.atan2(target.y, target.x);
  const r = Math.hypot(target.x, target.y);
  // 그리퍼가 아래를 보므로 손목 축은 목표보다 gripper만큼 위
  const h = target.z + g.gripper - g.baseHeight;
  const d2 = r * r + h * h;
  const c = (d2 - g.link1 ** 2 - g.link2 ** 2) / (2 * g.link1 * g.link2);
  const inRange = Math.abs(c) <= 1;
  const elbow = Math.acos(Math.min(1, Math.max(-1, c)));
  const shoulder =
    Math.atan2(r, h) - Math.atan2(g.link2 * Math.sin(elbow), g.link1 + g.link2 * Math.cos(elbow));
  const wrist = Math.PI / 2 - (shoulder + elbow);
  const within = [base, shoulder, elbow, wrist].every((a) => Math.abs(a) <= limit + 1e-9);
  return { angles: { base, shoulder, elbow, wrist }, reachable: inRange && within };
}
