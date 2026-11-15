# AGENTS.md — PhysiSim 개발 에이전트 지침

이 문서는 PhysiSim 저장소에서 작업하는 모든 AI 에이전트(Claude Code, Codex 등)와 사람 기여자가 따라야 하는 규칙이다.

## 0. 프로젝트 한 줄 요약

**PhysiSim** — AI 에이전트 기반 모델 중심(Model-driven) 물리 시스템 구성 및 시뮬레이션 플랫폼.
Model(정의) / Behavior(실행 로직) / Instance(런타임 객체)를 분리하고, 이를 조합해 전자·전기·기계·물리·제어 시스템을 시뮬레이션한다.

## 1. 문서 주도 개발 (Document-Driven Development)

**문서는 방향을, 코드는 세부를 설명한다.**

| 어디에 | 무엇을 |
|---|---|
| `docs/spec/PhysiSim_Specification.md` | 핵심 목표, 설계 철학, 시스템 구조, **확정된 결정** |
| `docs/PHASE_PLAN.md` | Phase별 목표, 마일스톤, 결정 게이트 |
| `docs/adr/` | 되돌리기 어려운 결정의 배경과 이유 |
| `docs/references.md` | 참고 서비스·오픈소스와 차용 포인트 |
| **코드** | 그 외 전부 — 인터페이스, 규칙, 예외 처리, 알고리즘 |

### 1.1 문서에 쓰는 것 / 쓰지 않는 것

- 쓴다: 왜 만드는가(목표), 큰 구조(시스템·패키지 경계·의존 방향), 핵심 개념의 정의, 사용자가 내린 결정.
- 쓰지 않는다: 필드 목록, 함수 시그니처, 세부 규칙, 엣지 케이스. 이것들은 **코드가 진실**이다.
- 문서의 코드 예시는 개념 설명용 스케치다. 코드와 달라도 문서를 맞추려고 애쓰지 않는다. 구조나 결정이 바뀐 경우에만 문서를 고친다.
- 문서가 세부를 다루지 않는다고 작업을 멈추지 않는다. 핵심 목표·구조에 맞으면 구현하면서 정한다.

### 1.2 코드가 스스로 설명하게

- **타입·스키마가 명세다.** Zod 스키마와 `z.infer` 타입이 Model/Capability/Instance 포맷의 정의다.
- **테스트가 동작 명세다.** 테스트 이름은 규칙을 문장으로 쓴다. 예: `"Model binding behavior overrides capability default"`.
- **공개 API에는 TSDoc**을 단다: 무엇을 하는지, 단위, 불변 조건.
- **"왜"는 주석으로**, "무엇"은 이름으로. 이름으로 설명이 안 되면 이름을 고친다.
- **예제가 문서다.** `packages/models`의 표준 모델과 `examples/`의 System 파일이 사용법 문서를 대신한다.
- 각 패키지 `README.md`는 짧게: 목적 1~2문장, 진입점, 예제 링크.

### 1.3 작업 흐름

1. `PHASE_PLAN.md`에서 해당 작업(Task ID, 예: `P1-T3`)과 목표를 확인한다.
2. 작업이 핵심 목표·구조와 맞는지 스펙의 관련 섹션으로 확인한다.
3. 사용자 결정이 필요한 항목(§2)이면 질문하고 멈춘다. 아니면 진행한다.
4. 테스트와 구현을 작성한다. 세부 규칙은 테스트·타입·주석으로 남긴다.
5. `pnpm lint && pnpm typecheck && pnpm test` 통과를 확인한다.
6. 구조·결정이 바뀌었을 때만 스펙/ADR을 고친다. `PHASE_PLAN.md`의 체크박스는 같은 커밋에서 체크한다.
7. §3 규칙으로 커밋한다.

## 2. 의사결정 규칙 — 반드시 사용자에게 질문

에이전트는 아래 항목을 **스스로 결정하지 않는다.** 반드시 사용자에게 질문하고 답을 받은 뒤 진행한다.

- 핵심 목표·설계 철학과 충돌하거나 이를 바꾸는 것
- 이미 확정된 결정(스펙 §12)의 변경
- `PHASE_PLAN.md`의 **결정 게이트** 항목
- 패키지 경계, 의존 방향, 데이터 포맷(Model JSON, System 문서) 같은 큰 구조
- **새 런타임 의존성 추가** (특히 WASM 엔진, 물리 엔진, UI 프레임워크)
- **라이선스가 MIT/Apache-2.0/BSD/ISC가 아닌 코드·데이터의 사용** (GPL, CC-BY-SA 등)
- Phase 범위 확장, Phase 순서 변경
- 외부 서비스 연동, 배포, 비용이 발생하는 작업

질문 방식:

- 선택지 2~4개, 각 장단점, **추천안 1개**를 제시한다. 가능하면 참고 사례(§4)를 근거로 든다.
- 답을 기다리는 동안 그 결정에 의존하지 않는 작업만 진행한다.
- 답을 받으면 스펙 §12 결정 이력에 한 줄 기록하고, 되돌리기 어려운 결정이면 ADR을 쓴다.

에이전트가 스스로 정하는 것: 위에 해당하지 않는 구현 세부(내부 API, 필드 이름, 알고리즘 선택, 파일 구조, 테스트 구성, 동작 불변 리팩터링). 정한 내용은 코드로 설명한다.

## 3. 커밋 규칙 — 작업(Task)별 커밋

- **1 Task = 1 커밋 이상, 1 커밋 = 1 관심사.** 여러 Task를 한 커밋에 섞지 않는다.
- 문서(스펙·ADR) 결정 커밋과 구현 커밋은 분리한다.
- 형식: [Conventional Commits](https://www.conventionalcommits.org/) + Task ID

  ```text
  <type>(<scope>): <요약> [<TaskID>]

  <무엇을, 왜>
  ```

  - `type`: `feat` `fix` `refactor` `test` `docs` `chore` `build` `ci` `perf`
  - `scope`: 패키지 또는 영역 (`core`, `engine`, `models`, `agent`, `cli`, `web`, `spec`, `plan` …)
  - 예: `feat(core): resolve behavior from capability binding [P1-T4]`

- 커밋 전 lint·typecheck·test 통과 필수. 훅을 우회(`--no-verify`)하지 않는다.
- 기본 브랜치는 `main`. Phase 작업은 `phase/N-short-name` 브랜치에서 하고 Phase 완료 시 main에 병합한다.
- push, force-push, 브랜치 삭제, 태그 생성은 사용자 요청이 있을 때만 한다.

## 4. 참고 자료 적극 활용

새 기능을 설계하기 전에 `docs/references.md`의 관련 항목을 먼저 보고, 부족하면 조사해 추가한다.

| 대상 | 주로 참고할 점 |
|---|---|
| BenchTwin | 실부품 동작 재현, 고장(과전압 등) 시뮬레이션, 계측기, BOM, 로봇 필드 |
| Constructa (AtumX) | 조립 → 배선 → 코딩 → 물리 실행의 통합 흐름 |
| Tinkercad Circuits | 입문자 친화 에디터 UX, 부품 라이브러리, 블록 코딩 |
| Wokwi / avr8js / wokwi-elements | System 문서 포맷(`diagram.json`), MCU 에뮬레이션, 부품 웹 컴포넌트 |
| Modelica / FMI | Port(Connector)·acausal 연결, replaceable, 도메인 간 co-simulation |
| ngspice(WASM) / Falstad CircuitJS | 회로 해석(MNA) |
| Rapier / MuJoCo / URDF·SDF | 강체 물리, 관절, 기계 모델 기술 포맷 |
| MCP | Agent tool 인터페이스 |

- 코드를 **복사**할 때는 라이선스를 확인하고, MIT/Apache-2.0/BSD/ISC가 아니면 §2에 따라 질문한다. 출처는 파일 상단 주석과 `docs/references.md`에 남긴다.
- GPL 프로젝트(Falstad, SimulIDE 등)는 **알고리즘·설계만 참고**하고 코드는 가져오지 않는다.
- 특정 상용 서비스의 브랜드, UI 디자인, 에셋을 그대로 복제하지 않는다.

## 5. 아키텍처 원칙

- **Model은 데이터다.** Model·Capability 정의는 JSON + Zod 스키마로 표현하고 런타임에 검증한다.
- **Behavior는 코드다.** Model 안에 로직을 넣지 않는다. Capability가 기본 Behavior를 참조하고 Model이 override한다(스펙 §14, ADR-0001).
- **Instance는 상태다.** Model을 참조만 하고 복사하지 않는다.
- **물리량은 단위와 함께** 다룬다. 공개 API에 단위 없는 숫자를 노출하지 않는다.
- **결정론**: 같은 입력·시드면 같은 결과. 시뮬레이션 코어에서 `Date.now()`, `Math.random()`을 직접 쓰지 않는다.
- **Headless 우선**: 코어 패키지는 DOM·브라우저 API에 의존하지 않는다. UI·CLI·Agent는 코어를 소비만 한다.
- **Agent 친화**: 공개 API는 JSON 직렬화 가능하고, Zod 스키마로부터 JSON Schema를 뽑을 수 있어야 한다.

## 6. 저장소 구조 (목표 — Phase 0에서 생성)

```text
physical-system-simulator/
├── AGENTS.md
├── docs/            # spec, PHASE_PLAN, references, adr
├── packages/
│   ├── core/        # Model·Capability·Behavior·Instance 스키마, Registry
│   ├── engine/      # 시간·이벤트·상태·Behavior 실행·Solver
│   ├── models/      # 표준 Model/Capability/Behavior 라이브러리
│   ├── agent/       # MCP 서버
│   └── cli/         # physisim CLI
├── examples/        # System 예제 (사용법 문서 역할)
└── apps/
    └── web/         # 에디터·뷰어 (Phase 5+)
```

의존 방향: `engine → core`, `models → core`, `agent → engine, models`, `cli → engine, models`, `web → *`. 역방향·순환 의존 금지.

## 7. 명령어 (Phase 0 이후)

```bash
pnpm install
pnpm lint        # Biome
pnpm typecheck   # tsc
pnpm test        # Vitest
pnpm build
```

## 8. 코딩 컨벤션

- TypeScript `strict`, ESM, `any` 금지(불가피하면 `unknown` + 검증).
- 공개 타입은 Zod 스키마에서 `z.infer`로 파생한다. 타입과 스키마를 이중 정의하지 않는다.
- ID는 소문자 네임스페이스: `model.arduino-uno`, `capability.gpio`, `behavior.digital-io`.
- 파일·폴더는 kebab-case. 테스트는 `*.test.ts`로 소스 옆에 둔다.
- 문서·주석은 한국어, 식별자·커밋 type/scope는 영어.

## 9. 작업 완료 보고

- 완료한 Task ID와 커밋 해시
- 테스트·검증 결과 (실패하거나 생략한 항목은 그대로 명시)
- 새로 생긴 결정 필요 사항(있다면 질문 형태로)
