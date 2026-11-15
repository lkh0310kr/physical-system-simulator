import { defineBehavior } from "@physisim/core";

type Inputs = { mode: string; write: boolean; external: boolean };
type Outputs = { driving: boolean; level: boolean };

/** GPIO 핀 하나. 출력 모드면 `write`를 구동하고, 입력 모드면 외부 레벨을 읽는다. 상태 없음. */
export const digitalIo = defineBehavior<Record<string, never>, Inputs, Outputs>({
  id: "behavior.digital-io",
  init: () => ({}),
  step: (state, { mode, write, external }) => ({
    state,
    outputs:
      mode === "output" ? { driving: true, level: write } : { driving: false, level: external },
  }),
});
