/** 메인 스레드 ↔ 시뮬레이션 Worker 메시지. 모두 구조화 복제 가능한 순수 데이터. */
import type { PropertyValue } from "@physisim/core";

export type ToWorker =
  /** 문서 JSON과 참조 파일 내용(문서 기준 상대 경로 → 내용)으로 시뮬레이션을 새로 만든다. 실행 중이면 계속 실행. */
  | {
      readonly type: "load";
      readonly docJson: unknown;
      readonly refs: Readonly<Record<string, string>>;
    }
  | { readonly type: "play" }
  | { readonly type: "pause" }
  | { readonly type: "reset" };

export interface Frame {
  readonly type: "frame";
  readonly running: boolean;
  /** 시뮬레이션 시각 [s]. */
  readonly time: number;
  /** "instance.output" → 값. */
  readonly signals: Readonly<Record<string, PropertyValue>>;
  /** 전압이 걸린 연결의 인덱스 (`doc.connections` 기준). */
  readonly energized: readonly number[];
  /** Instance ID → 프로그램 오류. */
  readonly errors: Readonly<Record<string, string>>;
}

export type FromWorker = Frame | { readonly type: "error"; readonly message: string };
