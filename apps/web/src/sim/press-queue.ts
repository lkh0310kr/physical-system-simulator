/**
 * 누름 유지: 사용자가 누르고 떼는 사이가 시뮬레이션 한 프레임보다 짧으면 스위치가 닫힌 상태를 한 스텝도 못 보고 지나간다.
 * 그래서 "누름 후 아직 시뮬레이션이 진행되지 않았다"면 뗌을 다음 진행 뒤로 미룬다 (최소 한 프레임은 눌려 있다).
 */
export class PressQueue {
  /** 눌렀고 아직 시뮬레이션이 한 번도 진행되지 않은 부품. */
  private fresh = new Set<string>();
  /** 뗌이 미뤄진 부품. */
  private pending: string[] = [];

  press(id: string): void {
    this.fresh.add(id);
    this.pending = this.pending.filter((p) => p !== id);
  }

  /** 지금 바로 뗄 수 있으면 true. false면 다음 `tick`에서 돌려받는다. */
  release(id: string): boolean {
    if (!this.fresh.has(id)) return true;
    if (!this.pending.includes(id)) this.pending.push(id);
    return false;
  }

  /** 시뮬레이션이 진행된 뒤에 부른다: 이제 뗄 수 있는 부품들. */
  tick(): string[] {
    this.fresh.clear();
    const due = this.pending;
    this.pending = [];
    return due;
  }
}
