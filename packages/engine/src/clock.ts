/**
 * 혼합 시간 모델의 시계와 이벤트 큐 (스펙 §9.1).
 * 시간은 정수 마이크로초(µs)로 다뤄 누적 오차가 없다. 같은 시각의 이벤트는 등록 순서대로 처리한다.
 */

export const US_PER_S = 1_000_000;

export const toSeconds = (us: number): number => us / US_PER_S;

/** 초 → µs (반올림). */
export const toMicros = (seconds: number): number => Math.round(seconds * US_PER_S);

interface Entry<T> {
  readonly at: number;
  readonly seq: number;
  readonly payload: T;
}

export interface Scheduler<T> {
  /** `at`(µs)에 처리할 이벤트 등록. */
  schedule(at: number, payload: T): void;
  /** 가장 이른 이벤트 시각. 없으면 `undefined`. */
  nextTime(): number | undefined;
  /** `now` 이하 시각의 이벤트를 시각·등록 순으로 꺼낸다. */
  popDue(now: number): T[];
}

export function createScheduler<T>(): Scheduler<T> {
  const queue: Entry<T>[] = [];
  let seq = 0;
  const before = (a: Entry<T>, b: Entry<T>) => a.at < b.at || (a.at === b.at && a.seq < b.seq);
  return {
    schedule(at, payload) {
      const entry = { at, seq: seq++, payload };
      let lo = 0;
      let hi = queue.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const m = queue[mid];
        if (m && before(m, entry)) lo = mid + 1;
        else hi = mid;
      }
      queue.splice(lo, 0, entry);
    },
    nextTime: () => queue[0]?.at,
    popDue(now) {
      let count = 0;
      while (count < queue.length && (queue[count]?.at ?? Number.POSITIVE_INFINITY) <= now) count++;
      return queue.splice(0, count).map((e) => e.payload);
    },
  };
}

/** 다음 스텝 시각: 고정 간격, 다음 이벤트, 종료 시각 중 가장 이른 것. */
export function nextStepTime(now: number, dt: number, end: number, nextEvent?: number): number {
  return Math.min(
    now + dt,
    end,
    nextEvent !== undefined && nextEvent > now ? nextEvent : Number.POSITIVE_INFINITY,
  );
}
