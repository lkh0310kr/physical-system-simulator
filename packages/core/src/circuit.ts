/**
 * 전기 도메인 기여: Behavior가 자기 Port 이름으로 내놓는 회로 요소와, 해석 결과를 읽는 인터페이스.
 * 모든 값은 SI. 엔진의 회로 Solver가 Net 위에서 푼다 (스펙 §9.1).
 */

export type CircuitElement =
  /** 두 Port 사이의 저항. 전류 방향 a → b. */
  | {
      readonly kind: "resistor";
      readonly id: string;
      readonly a: string;
      readonly b: string;
      readonly resistance: number;
    }
  /** 접지 기준 전압 `voltage`를 내부 저항 `resistance`를 거쳐 Port에 거는 구동원 (MCU 출력 핀 등). 전류는 Port로 나가는 방향이 +. */
  | {
      readonly kind: "drive";
      readonly id: string;
      readonly port: string;
      readonly voltage: number;
      readonly resistance: number;
      /**
       * PWM 듀티 (0~1, 생략하면 항상 켜짐). `voltage`를 듀티만큼의 시간 동안, 나머지는 0V로 구동한다.
       * 엔진은 켜짐·꺼짐 상태를 각각 풀어 평균하므로 LED 같은 비선형 부품도 평균 전류로 동작한다.
       */
      readonly duty?: number;
    }
  /**
   * 정전류 부하: Port에서 접지로 `current`를 끌어간다 (MCU·모듈이 상태별로 쓰는 전류 등).
   * 전원이 이 전류를 감당하지 못해도 전류는 줄지 않는다 — 전압이 떨어질 뿐이다.
   */
  | {
      readonly kind: "load";
      readonly id: string;
      readonly port: string;
      /** [A] 접지로 흐르는 방향이 +. */
      readonly current: number;
    }
  /**
   * 두 Port 사이의 이상 전류원: `current`가 a에서 b로 흐르도록 강제한다 (전류는 a에서 빠져 b로 들어간다).
   * 모터의 역기전력은 "저항 ∥ 전류원(= −e/R)"의 노턴 등가로 표현한다.
   */
  | {
      readonly kind: "source";
      readonly id: string;
      readonly a: string;
      readonly b: string;
      /** [A] a → b 방향이 +. */
      readonly current: number;
    }
  /** 구간 선형 다이오드: 순방향 전압을 넘으면 `onResistance`로 도통, 아니면 차단. 전류 방향 anode → cathode. */
  | {
      readonly kind: "diode";
      readonly id: string;
      readonly anode: string;
      readonly cathode: string;
      readonly forwardVoltage: number;
      readonly onResistance: number;
    };

/** 회로 해석 결과. 이름은 해당 Instance 기준 (Port 이름, 요소 id). */
export interface CircuitReadings {
  /** Port의 접지 기준 전압 [V]. */
  voltage(port: string): number;
  /** 요소의 전류 [A]. 방향은 요소 정의를 따른다. */
  current(elementId: string): number;
}
