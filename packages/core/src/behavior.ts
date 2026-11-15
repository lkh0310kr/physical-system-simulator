/**
 * Behavior: Capability를 실제로 동작시키는 실행 로직 (스펙 §6, §14.4).
 *
 * - 기본은 순수 함수 `step`. 같은 입력이면 같은 결과를 낸다.
 * - 인터럽트·타이머 같은 이벤트성 동작만 선택적 `onEvent` 훅을 쓴다.
 * - 물리 도메인에 참여하면 `circuit`으로 요소를 내놓고, 해석 결과는 `ctx.circuit`으로 읽는다.
 * - 상태는 Behavior가 아니라 Instance가 가진다. Behavior는 상태를 받아 새 상태를 돌려준다.
 */
import type { CircuitElement, CircuitReadings } from "./circuit.ts";
import type { MechanicalElement, MechanicalReadings } from "./mechanics.ts";
import type { PropertyValue, ResolvedValues } from "./property.ts";

export type Signals = Record<string, PropertyValue>;

export interface BehaviorContext {
  /** Model 속성 (SI로 정규화됨). */
  readonly properties: ResolvedValues;
  /** Model의 Capability 바인딩 설정 (SI로 정규화됨). */
  readonly config: ResolvedValues;
  /** 직전 스텝의 기계 해석 결과 (축 각속도). 기계 Port가 없으면 없다. */
  readonly mechanical?: MechanicalReadings;
}

export interface StepContext extends BehaviorContext {
  /** 현재 시뮬레이션 시각 [s]. */
  readonly time: number;
  /** 이번 스텝의 길이 [s]. */
  readonly dt: number;
  /** 이 Instance의 회로 해석 결과. 회로에 참여하지 않으면 없다. */
  readonly circuit?: CircuitReadings;
}

export interface SimEvent {
  readonly type: string;
  readonly payload?: unknown;
}

export interface StepResult<S, O extends Signals> {
  readonly state: S;
  readonly outputs: O;
}

export interface Behavior<S = unknown, I extends Signals = Signals, O extends Signals = Signals> {
  /** `behavior.` 네임스페이스 ID. */
  readonly id: string;
  /** Instance 생성 시 초기 상태. */
  init(ctx: BehaviorContext): S;
  /** 한 스텝 진행. 순수 함수여야 한다 (입력·상태 변경 금지, 외부 I/O 금지). */
  step(state: S, inputs: I, ctx: StepContext): StepResult<S, O>;
  /** 선택: 현재 상태에서 이 Behavior가 회로에 기여하는 요소. 매 스텝 해석 전에 호출된다. */
  circuit?(state: S, ctx: BehaviorContext): readonly CircuitElement[];
  /**
   * 선택: 이 Behavior가 기계 Net에 얹는 회전체. 회로 해석 직후, 스텝 전에 호출되므로 `ctx.circuit`(이번 스텝 전류)을 쓴다.
   */
  mechanics?(state: S, ctx: StepContext): readonly MechanicalElement[];
  /**
   * 선택: 이 Behavior가 평면을 달리는 몸체를 구동한다. 물리 엔진이 켜져 있으면 몸체(강체)가 만들어지고,
   * 매 스텝 `drive`의 명령으로 움직이며 장애물에 막힌다. 물리가 없으면 Behavior가 직접 적분한다.
   */
  drive?(state: S, ctx: StepContext): PlanarCommand;
  /** 선택: 물리가 계산한 자세를 받아 상태와 출력을 갱신한다 (`drive`와 함께 쓴다). */
  onPose?(state: S, outputs: O, pose: PlanarPose): StepResult<S, O>;
  /** 선택: 이벤트 처리. 없으면 이벤트는 무시된다. */
  onEvent?(state: S, event: SimEvent, ctx: StepContext): StepResult<S, O>;
}

/** 평면 이동 명령: 몸체 방향으로 `speed`[m/s], 위에서 보아 반시계 `yawRate`[rad/s]. */
export interface PlanarCommand {
  readonly speed: number;
  readonly yawRate: number;
}

/** 물리가 계산한 평면 자세. 시작 위치 기준 [m]와 방향 [rad](연속, 감기지 않음). */
export interface PlanarPose {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
}

/** 타입 추론을 돕는 항등 함수. */
export function defineBehavior<S, I extends Signals = Signals, O extends Signals = Signals>(
  behavior: Behavior<S, I, O>,
): Behavior<S, I, O> {
  return behavior;
}
