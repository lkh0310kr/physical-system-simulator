/**
 * DC 회로 Solver: 노드 해석 + 구간 선형 다이오드 반복.
 *
 * 노드 0은 접지(0V). 이상 전압원을 쓰지 않고 구동원을 Norton 등가(전류원 ∥ 컨덕턴스)로 넣으므로
 * MNA의 분기 전류 변수 없이 G·V = I 만 풀면 된다.
 * 모든 노드에 아주 작은 컨덕턴스(GMIN)를 접지로 달아 떠 있는 노드에서도 행렬이 특이해지지 않게 한다.
 */

/** 노드 번호로 해석된 회로 요소. */
export type NodeElement =
  | {
      readonly kind: "resistor";
      readonly id: string;
      readonly a: number;
      readonly b: number;
      readonly resistance: number;
    }
  | {
      readonly kind: "drive";
      readonly id: string;
      readonly node: number;
      readonly voltage: number;
      readonly resistance: number;
    }
  | {
      readonly kind: "diode";
      readonly id: string;
      readonly anode: number;
      readonly cathode: number;
      readonly forwardVoltage: number;
      readonly onResistance: number;
    };

export interface CircuitSolution {
  /** 노드 전압 [V]. 인덱스 0은 접지. */
  readonly voltages: readonly number[];
  /** 요소 id → 전류 [A]. */
  readonly currents: ReadonlyMap<string, number>;
  /** 다이오드 상태 반복이 수렴했는지. */
  readonly converged: boolean;
}

const GMIN = 1e-12;
const DIODE_OFF_CONDUCTANCE = 1e-9;
const MAX_ITERATIONS = 50;

/** n×n 정방 행렬 (행 우선 평탄 배열). */
class Matrix {
  readonly n: number;
  readonly data: Float64Array;
  constructor(n: number) {
    this.n = n;
    this.data = new Float64Array(n * n);
  }
  get(r: number, c: number): number {
    return this.data[r * this.n + c] ?? 0;
  }
  add(r: number, c: number, v: number): void {
    this.data[r * this.n + c] = this.get(r, c) + v;
  }
}

const at = (v: ArrayLike<number>, i: number): number => v[i] ?? 0;

/** 가우스 소거(부분 피벗)로 A·x = b. `a`, `b`를 변경한다. */
function solveLinear(a: Matrix, b: Float64Array): Float64Array {
  const n = a.n;
  const swapRows = (i: number, j: number) => {
    for (let c = 0; c < n; c++) {
      const t = a.get(i, c);
      a.data[i * n + c] = a.get(j, c);
      a.data[j * n + c] = t;
    }
    const t = at(b, i);
    b[i] = at(b, j);
    b[j] = t;
  };
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a.get(r, col)) > Math.abs(a.get(pivot, col))) pivot = r;
    }
    if (pivot !== col) swapRows(col, pivot);
    const p = a.get(col, col);
    for (let r = col + 1; r < n; r++) {
      const f = a.get(r, col) / p;
      if (f === 0) continue;
      for (let c = col; c < n; c++) a.add(r, c, -f * a.get(col, c));
      b[r] = at(b, r) - f * at(b, col);
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let sum = at(b, r);
    for (let c = r + 1; c < n; c++) sum -= a.get(r, c) * at(x, c);
    x[r] = sum / a.get(r, r);
  }
  return x;
}

/**
 * 다이오드 도통 상태를 스텝 사이에 기억해 다음 해석의 초깃값으로 쓰는 Solver.
 * 같은 입력 순서면 같은 결과 (결정론).
 */
export function createCircuitSolver() {
  const diodeOn = new Map<string, boolean>();

  function assemble(nodeCount: number, elements: readonly NodeElement[]) {
    const G = new Matrix(nodeCount - 1); // 접지 제외
    const I = new Float64Array(nodeCount - 1);
    const conduct = (a: number, b: number, g: number) => {
      if (a > 0) G.add(a - 1, a - 1, g);
      if (b > 0) G.add(b - 1, b - 1, g);
      if (a > 0 && b > 0) {
        G.add(a - 1, b - 1, -g);
        G.add(b - 1, a - 1, -g);
      }
    };
    /** a로 들어가는 전류원 (b에서 빠져나감). */
    const inject = (a: number, b: number, current: number) => {
      if (a > 0) I[a - 1] = at(I, a - 1) + current;
      if (b > 0) I[b - 1] = at(I, b - 1) - current;
    };
    for (let i = 1; i < nodeCount; i++) conduct(i, 0, GMIN);
    for (const e of elements) {
      switch (e.kind) {
        case "resistor":
          conduct(e.a, e.b, 1 / e.resistance);
          break;
        case "drive":
          conduct(e.node, 0, 1 / e.resistance);
          inject(e.node, 0, e.voltage / e.resistance);
          break;
        case "diode":
          if (diodeOn.get(e.id)) {
            const g = 1 / e.onResistance;
            conduct(e.anode, e.cathode, g);
            inject(e.cathode, e.anode, -e.forwardVoltage * g); // anode로 G·Vf 유입
          } else {
            conduct(e.anode, e.cathode, DIODE_OFF_CONDUCTANCE);
          }
          break;
      }
    }
    return { G, I };
  }

  function currentsOf(v: readonly number[], elements: readonly NodeElement[]) {
    const currents = new Map<string, number>();
    for (const e of elements) {
      switch (e.kind) {
        case "resistor":
          currents.set(e.id, (at(v, e.a) - at(v, e.b)) / e.resistance);
          break;
        case "drive":
          currents.set(e.id, (e.voltage - at(v, e.node)) / e.resistance);
          break;
        case "diode": {
          const vd = at(v, e.anode) - at(v, e.cathode);
          currents.set(
            e.id,
            diodeOn.get(e.id)
              ? (vd - e.forwardVoltage) / e.onResistance
              : vd * DIODE_OFF_CONDUCTANCE,
          );
          break;
        }
      }
    }
    return currents;
  }

  return {
    /** `nodeCount`는 접지(0)를 포함한 노드 수. */
    solve(nodeCount: number, elements: readonly NodeElement[]): CircuitSolution {
      let voltages: number[] = [0];
      let converged = false;
      for (let iter = 0; iter < MAX_ITERATIONS && !converged; iter++) {
        const { G, I } = assemble(nodeCount, elements);
        voltages = [0, ...solveLinear(G, I)];
        converged = true;
        for (const e of elements) {
          if (e.kind !== "diode") continue;
          const vd = at(voltages, e.anode) - at(voltages, e.cathode);
          const on = diodeOn.get(e.id) ?? false;
          // 도통 중인데 전류가 음수, 또는 차단 중인데 순방향 전압 초과 → 상태 뒤집기
          const shouldBeOn = on ? vd - e.forwardVoltage > 0 : vd > e.forwardVoltage;
          if (shouldBeOn !== on) {
            diodeOn.set(e.id, shouldBeOn);
            converged = false;
          }
        }
      }
      return { voltages, currents: currentsOf(voltages, elements), converged };
    },
  };
}
