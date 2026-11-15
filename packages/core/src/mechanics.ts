/**
 * 기계 도메인 기여 (회전): 같은 기계 Net에 묶인 축은 하나의 각속도 ω를 공유한다 (강체 결합, 스펙 §9.1).
 * Behavior는 자기 Port마다 회전체(토크·관성·점성 마찰)를 내놓고, 엔진이 Net마다
 * `(ΣJ)·dω/dt = Στ − (Σb)·ω` 를 풀어 ω를 돌려 준다. 단위는 SI (N·m, kg·m², N·m·s/rad, rad/s).
 */
export interface MechanicalElement {
  readonly kind: "rotor";
  readonly id: string;
  /** 이 회전체가 붙은 기계 Port. */
  readonly port: string;
  /** 축을 가속하는 방향이 +인 토크 [N·m]. */
  readonly torque: number;
  /** 회전 관성 [kg·m²]. 0이면 질량 없는 부하(마찰만). */
  readonly inertia: number;
  /** 점성 마찰 계수 [N·m·s/rad]. */
  readonly damping: number;
}

/** 기계 해석 결과를 읽는 인터페이스. */
export interface MechanicalReadings {
  /** Port가 속한 Net의 각속도 [rad/s]. */
  omega(port: string): number;
}
