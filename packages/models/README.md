# @physisim/models

PhysiSim 표준 라이브러리. Model·Capability는 `src/**/*.json` 데이터, Behavior는 `src/behaviors/*.ts` 코드.

```ts
import { createStandardRegistry } from "@physisim/models";
const registry = createStandardRegistry();
registry.getModel("model.arduino-uno");
```

새 부품은 JSON 파일을 추가하고 `src/index.ts`의 목록에 등록한다. 형식은 `@physisim/core`의 `ModelSchema`가 기준이다.
