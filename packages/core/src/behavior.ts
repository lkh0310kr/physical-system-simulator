/**
 * Behavior: Capability를 실제로 동작시키는 실행 로직 (스펙 §6, §14.4).
 *
 * - 기본은 순수 함수 `step`. 같은 입력이면 같은 결과를 낸다.
 * - 인터럽트·타이머 같은 이벤트성 동작만 선택적 `onEvent` 훅을 쓴다.
 * - 상태는 Behavior가 아니라 Instance가 가진다. Behavior는 상태를 받아 새 상태를 돌려준다.
 */
import type { PropertyValue, ResolvedValues } from "./property.ts";

export type Signals = Record<string, PropertyValue>;

export interface BehaviorContext {
  /** Model 속성 (SI로 정규화됨). */
  readonly properties: ResolvedValues;
  /** Model의 Capability 바인딩 설정 (SI로 정규화됨). */
  readonly config: ResolvedValues;
}

export interface StepContext extends BehaviorContext {
  /** 현재 시뮬레이션 시각 [s]. */
  readonly time: number;
  /** 이번 스텝의 길이 [s]. */
  readonly dt: number;
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
  /** 선택: 이벤트 처리. 없으면 이벤트는 무시된다. */
  onEvent?(state: S, event: SimEvent, ctx: StepContext): StepResult<S, O>;
}

/** 타입 추론을 돕는 항등 함수. */
export function defineBehavior<S, I extends Signals = Signals, O extends Signals = Signals>(
  behavior: Behavior<S, I, O>,
): Behavior<S, I, O> {
  return behavior;
}
