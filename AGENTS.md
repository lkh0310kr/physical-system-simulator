# AGENTS.md — PhysiSim 개발 에이전트 지침

이 문서는 PhysiSim 저장소에서 작업하는 모든 AI 에이전트(Claude Code, Codex 등)와 사람 기여자가 따라야 하는 규칙이다.

## 0. 프로젝트 한 줄 요약

**PhysiSim** — AI 에이전트 기반 모델 중심(Model-driven) 물리 시스템 구성 및 시뮬레이션 플랫폼.
Model(정의) / Behavior(실행 로직) / Instance(런타임 객체)를 분리하고, 이를 조합해 전자·전기·기계·물리·제어 시스템을 시뮬레이션한다.

## 1. 진실 공급원 (Source of Truth)

| 문서 | 역할 |
|---|---|
| `docs/spec/PhysiSim_Specification.md` | **설계 명세. 최상위 기준.** 모든 구현은 여기서 출발한다. |
| `docs/PHASE_PLAN.md` | Phase별 목표, 작업(Task), 완료 기준, 결정 게이트 |
| `docs/references.md` | 참고 서비스·오픈소스 분석과 차용 포인트 |
| `docs/adr/` | 아키텍처 결정 기록(ADR). 스펙 결정의 상세 근거 |

우선순위: **스펙 > ADR > PHASE_PLAN > 코드 주석**. 충돌하면 스펙이 이긴다. 스펙이 틀렸다고 판단되면 고치지 말고 사용자에게 질문한다(§3).

## 2. 스펙 주도 개발 (Spec-Driven Development)

모든 작업은 다음 순서를 따른다.

1. **스펙 확인** — 작업과 관련된 스펙 섹션을 읽고, `PHASE_PLAN.md`에서 해당 Task ID(예: `P1-T3`)를 찾는다.
2. **공백 점검** — 구현에 필요한 내용이 스펙에 없거나 "미결정/대기" 상태라면 **구현하지 않고 멈춘다.** §3 절차로 사용자에게 질문한다.
3. **스펙 갱신 (필요 시)** — 사용자가 결정하면 스펙에 반영한다.
   - 스펙 버전을 올리고(`v0.5 → v0.6`), §12 설계 결정 이력과 변경 이력 표를 갱신한다.
   - 기존 결정을 바꾸는 경우 변경 이유와 영향을 기록한다.
   - 큰 결정은 `docs/adr/NNNN-title.md`에 ADR로 남긴다(`docs/adr/0000-template.md` 참고).
   - **스펙 변경은 구현과 별도 커밋**으로 먼저 남긴다.
4. **테스트 먼저** — 스펙의 규칙을 테스트로 옮긴다. 테스트 이름이나 주석에 스펙 섹션을 표기한다(예: `// spec §14.2`).
5. **구현** — 테스트를 통과하는 최소 구현. 스펙에 없는 기능을 임의로 추가하지 않는다.
6. **검증** — `pnpm lint && pnpm typecheck && pnpm test`가 모두 통과해야 한다. 실패한 채로 커밋하지 않는다.
7. **계획 갱신** — `PHASE_PLAN.md`의 해당 Task 체크박스를 같은 커밋에서 체크한다.
8. **커밋** — §4 규칙에 따라 작업 단위로 커밋한다.

## 3. 의사결정 규칙 — 반드시 사용자에게 질문

에이전트는 아래 항목을 **스스로 결정하지 않는다.** 반드시 사용자에게 질문하고 답을 받은 뒤 진행한다.

- 스펙에서 "미결정 / 대기"인 항목 (Instance 구조, Composition 구조, Simulation Engine, Agent 연동 등)
- 이미 "확정"된 스펙 결정의 변경
- 공개 인터페이스·Model JSON 스키마·System 문서 포맷의 변경
- 패키지 경계, 의존 방향 등 아키텍처 구조 변경
- **새 런타임 의존성 추가** (특히 WASM 엔진, 물리 엔진, UI 프레임워크)
- **라이선스가 MIT/Apache-2.0/BSD/ISC가 아닌 코드·데이터의 사용** (GPL, CC-BY-SA 등)
- Phase 범위 확장, Phase 순서 변경, Task 추가·삭제
- 외부 서비스 연동, 배포, 비용이 발생하는 작업

질문 방식:

- 선택지 2~4개를 제시하고, 각 선택지의 장단점과 **추천안 1개**를 명시한다.
- 가능하면 참고 사례(§5)를 근거로 든다.
- 질문 중에는 관련 없는 작업만 진행할 수 있다. 결정에 의존하는 코드는 작성하지 않는다.
- 답을 받으면 §2-3 절차로 스펙/ADR에 기록한다. **채팅에서만 합의하고 문서에 남기지 않는 것은 금지.**

에이전트가 스스로 정해도 되는 것: 내부 구현 세부(비공개 함수 이름, 파일 내부 구조), 테스트 케이스 구성, 리팩터링(동작 불변), 문서 오탈자.

## 4. 커밋 규칙 — 작업(Task)별 커밋

- **1 Task = 1 커밋 이상, 1 커밋 = 1 관심사.** 여러 Task를 한 커밋에 섞지 않는다.
- 스펙/ADR 변경 커밋과 구현 커밋은 분리한다.
- 형식: [Conventional Commits](https://www.conventionalcommits.org/) + Task ID

  ```text
  <type>(<scope>): <요약> [<TaskID>]

  <무엇을, 왜 — 관련 스펙 섹션>
  ```

  - `type`: `feat` `fix` `refactor` `test` `docs` `chore` `build` `ci` `perf`
  - `scope`: 패키지 또는 영역 (`core`, `engine`, `models`, `agent`, `web`, `spec`, `plan` …)
  - 예: `feat(core): add Capability binding resolver [P1-T4]` / 본문에 `spec §14.2`

- 커밋 전 lint·typecheck·test 통과 필수. 훅을 우회(`--no-verify`)하지 않는다.
- 기본 브랜치는 `main`. Phase 단위로 작업할 때는 `phase/N-short-name` 브랜치를 쓰고, Phase 완료 시 main에 병합한다.
- push, force-push, 브랜치 삭제, 태그 생성은 사용자 요청이 있을 때만 한다.

## 5. 참고 자료 적극 활용

새 기능을 설계하기 전에 `docs/references.md`의 관련 항목을 먼저 확인하고, 부족하면 조사해 추가한다.

| 대상 | 주로 참고할 점 |
|---|---|
| BenchTwin | 실부품 동작 재현, 고장(과전압 등) 시뮬레이션, 계측기, BOM, 로봇 필드 |
| Constructa (AtumX) | 조립 → 배선 → 코딩 → 물리 실행의 통합 흐름 |
| Tinkercad Circuits | 초보자 친화 에디터 UX, 부품 라이브러리, 블록 코딩 |
| Wokwi / avr8js / wokwi-elements | System 문서 포맷(`diagram.json`), MCU 에뮬레이션, 부품 웹 컴포넌트 |
| Modelica / FMI | Port(Connector)·acausal 연결, replaceable, 도메인 간 co-simulation |
| ngspice(WASM) / Falstad CircuitJS | 회로 해석(MNA) |
| Rapier / MuJoCo / URDF·SDF | 강체 물리, 관절, 기계 모델 기술 포맷 |
| MCP | Agent tool 인터페이스 |

규칙:

- 코드를 **복사**할 때는 라이선스를 확인하고, MIT/Apache-2.0/BSD/ISC가 아니면 §3에 따라 질문한다. 출처는 파일 상단 주석과 `docs/references.md`에 남긴다.
- GPL 프로젝트(Falstad, SimulIDE 등)는 **알고리즘·설계만 참고**하고 코드는 가져오지 않는다.
- 특정 상용 서비스의 브랜드, UI 디자인, 에셋을 그대로 복제하지 않는다.

## 6. 아키텍처 원칙 (스펙 §2, §11 요약)

- **Model은 데이터다.** Model·Capability 정의는 JSON(또는 TS 리터럴) + Zod 스키마로 표현하고 런타임에 검증한다.
- **Behavior는 코드다.** Model 안에 로직을 넣지 않는다. Behavior는 `BehaviorRef`로 참조되고 Registry에서 해석된다(스펙 §14).
- **Instance는 상태다.** Model을 참조만 하고 복사하지 않는다.
- **물리량은 단위와 함께** 다룬다. 단위 없는 숫자를 공개 API로 노출하지 않는다.
- **결정론**: 같은 입력·시드면 같은 결과. 시뮬레이션 코어에서 `Date.now()`, `Math.random()`을 직접 쓰지 않는다.
- **Headless 우선**: 코어 패키지는 DOM·브라우저 API에 의존하지 않는다. UI는 코어를 소비만 한다.
- **Agent 친화**: 공개 API는 JSON 직렬화 가능하고, Zod 스키마로부터 JSON Schema를 뽑을 수 있어야 한다.

## 7. 저장소 구조 (목표 — Phase 0에서 생성)

```text
physical-system-simulator/
├── AGENTS.md
├── docs/
│   ├── spec/PhysiSim_Specification.md
│   ├── PHASE_PLAN.md
│   ├── references.md
│   └── adr/
├── packages/
│   ├── core/       # Model·Capability·Behavior·Instance 타입, Zod 스키마, Registry
│   ├── units/      # 물리량·단위 (Phase 1 결정에 따라)
│   ├── engine/     # Simulation Engine: 시간·이벤트·상태·Behavior 실행·Solver
│   ├── models/     # 표준 Model/Capability/Behavior 라이브러리 (LED, GPIO, Arduino UNO …)
│   ├── agent/      # MCP 서버, Agent tool
│   └── cli/        # physisim CLI
└── apps/
    └── web/        # 에디터·뷰어 (Phase 5+)
```

의존 방향: `core ← units`, `engine → core`, `models → core`, `agent → engine, models`, `cli → engine, models`, `web → *`. 역방향·순환 의존 금지.

## 8. 명령어 (Phase 0 이후)

```bash
pnpm install
pnpm lint        # Biome
pnpm typecheck   # tsc --noEmit (project references)
pnpm test        # Vitest
pnpm build
```

## 9. 코딩 컨벤션

- TypeScript `strict`, ESM, `any` 금지(불가피하면 `unknown` + 검증).
- 공개 타입은 Zod 스키마에서 `z.infer`로 파생한다. 타입과 스키마를 이중 정의하지 않는다.
- ID는 소문자 kebab/dot 네임스페이스: `model.arduino-uno`, `capability.gpio`, `behavior.digital-io`.
- 파일·폴더는 kebab-case. 테스트는 `*.test.ts`로 소스 옆에 둔다.
- 주석·문서는 한국어, 식별자·커밋 type/scope는 영어.

## 10. 작업 완료 보고

작업을 마치면 사용자에게 다음을 보고한다.

- 완료한 Task ID와 커밋 해시
- 테스트·검증 결과 (실패/생략한 항목이 있으면 그대로 명시)
- 새로 생긴 결정 필요 사항(있다면 질문 형태로)
