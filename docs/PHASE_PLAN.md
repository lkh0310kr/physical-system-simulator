# PhysiSim Phase Plan

> 기준: 스펙 v0.5 · 전략: **Headless 코어 우선** (코어 → Agent → 2D 에디터 → 3D·물리)
> 각 Phase는 **목표 · 마일스톤 · 작업 · 결정 게이트**만 적는다. 세부 설계는 구현하면서 코드로 남긴다.
> 🔶 **결정 게이트**는 착수 전에 반드시 사용자에게 질문한다(`AGENTS.md` §2).

## 한눈에 보기

| Phase | 이름 | 마일스톤 (데모) | 주요 참고 |
|---|---|---|---|
| 0 | Bootstrap | `pnpm test`가 CI에서 통과하는 빈 모노레포 | — |
| 1 | Model System | LED·GPIO·Arduino UNO Model을 JSON으로 정의·검증 | Modelica, Fritzing parts |
| 2 | Instance & Composition | "UNO + 저항 + LED" System 문서를 로드·검증 | Wokwi `diagram.json`, Modelica connector |
| 3 | Simulation Engine MVP | **CLI에서 LED Blink 시뮬레이션** (헤드리스) | Falstad(MNA 알고리즘), FMI |
| 4 | Agent v1 (파일 기반) | **에이전트가 파일을 고치면 `physisim watch`에 자동 반영** | Codex CLI, Claude Code |
| 5 | 2D System Editor | 브라우저에서 부품 배치·배선·실행 | Tinkercad, wokwi-elements |
| 6 | Electronics 확장 | 버튼·센서·모터 드라이버, 계측기, 과전압 고장 | BenchTwin, ngspice-WASM, avr8js |
| 7 | Mechanical & Physics | 모터→바퀴→차체 이동, 3D 뷰어 (스펙 §9.1 폐루프) | Constructa, BenchTwin 로봇, Rapier, URDF |
| 8 | Control & Agent v2 | PID 라인트레이서, Agent 결과 분석·개선 제안 | — |
| 9 | Model Editor & 생태계 | Model 작성 UI, BOM 내보내기, 공유 | BenchTwin BOM |

---

## Phase 0 — Bootstrap

**목표**: 모든 이후 작업이 올라갈 저장소 뼈대와 품질 게이트.

- [x] P0-T1 pnpm 모노레포 초기화 (`packages/*`, `apps/*`, `examples/`), Node 버전 고정
- [x] P0-T2 TypeScript strict + project references, 공통 tsconfig
- [x] P0-T3 Biome (lint/format), Vitest 설정, 루트 스크립트(`lint` `typecheck` `test` `build`)
- [x] P0-T4 빈 `@physisim/core` 패키지 + 샘플 테스트로 파이프라인 검증
- [x] P0-T5 GitHub Actions CI (lint·typecheck·test)
- [x] P0-T6 커밋 훅 (simple-git-hooks: pre-commit에서 lint·typecheck·test)

🔶 결정 게이트
- ~~G0-1 빌드 도구~~ → tsc만 사용, Node 22 LTS 확정
- ~~G0-2 공개 여부·라이선스~~ → Public, MIT 확정

**완료 기준**: 깨끗한 클론에서 `pnpm i && pnpm lint && pnpm typecheck && pnpm test` 통과, CI green.

---

## Phase 1 — Model System (`@physisim/core`)

**목표**: 스펙 §4~§6, §14를 코드로 — Model·Property Schema·Capability·Behavior 참조를 데이터로 정의하고 검증한다.

- [x] P1-T1 물리량·단위 표현 (Quantity, 단위 변환·차원 검사)
- [x] P1-T2 Property Schema + 값 검증 (타입·단위·min/max)
- [x] P1-T3 Capability 정의 스키마 (inputs/outputs/parameters, `defaultBehavior`)
- [x] P1-T4 Model 스키마 (Identity/Properties/Components/Capabilities/Metadata) + Capability 바인딩 + Behavior 해석(override → default → 오류)
- [x] P1-T5 Registry (Model/Capability/Behavior 등록·조회·참조 무결성 검사, Components 순환 검출)
- [x] P1-T6 JSON 로더 + 사람이 읽을 수 있는 검증 오류 메시지
- [x] P1-T7 JSON Schema 내보내기 (`z.toJSONSchema`) — Agent·에디터용
- [x] P1-T8 `@physisim/models` 시작: `capability.gpio`, `model.led`, `model.resistor`, `model.arduino-uno` (+ `model.atmega328p` Component)

🔶 결정 게이트
- ~~G1-1 단위 시스템~~ → 자체 경량 구현
- ~~G1-2 Behavior 실행 시그니처~~ → 순수 함수 `step` + 선택적 이벤트 훅
- ~~G1-3 바인딩당 Behavior 수~~ → 1개

**완료 기준**: 표준 Model 4종이 검증 통과, 잘못된 Model은 명확한 오류. 테스트가 해석 규칙을 문장으로 설명.

---

## Phase 2 — Instance & Composition

**목표**: 스펙 §7, §8 — Model로부터 Instance를 만들고, Port 간 연결로 System을 구성한다.

- [x] P2-T1 Port(핀/커넥터) 개념을 Model에 추가 — 도메인(electrical, mechanical, signal …) 구분
- [x] P2-T2 Instance 생성 (Model 참조 + 초기 State + 파라미터 override)
- [x] P2-T3 System 문서 포맷 (instances + connections) 스키마와 로더
- [x] P2-T4 연결 검증과 Net 해석 (존재하는 Port인지, 도메인 호환). 단락 같은 전기적 검사는 Phase 3 Solver와 함께
- [x] P2-T5 `examples/blink-led.system.json`

🔶 결정 게이트
- ~~G2-1 Instance State~~ → 바인딩별 State
- ~~G2-2 연결 모델~~ → 핀-핀 작성 + 내부 Net
- ~~G2-3 레이아웃~~ → 같은 파일, 선택적 `layout` 섹션
- 계층 Composition은 Phase 7로 이동 (사용자 결정)

**완료 기준**: 예제 System이 로드·검증되고, 잘못된 연결이 정적 검사에서 잡힌다.

---

## Phase 3 — Simulation Engine MVP (`@physisim/engine`, `@physisim/cli`)

**목표**: 스펙 §9 — 시간·이벤트·상태·Behavior 실행을 갖춘 헤드리스 엔진. 스펙 §11대로 CPU 에뮬레이션 대신 단순 Behavior부터.

- [x] P3-T1 시뮬레이션 시계·스케줄러 (결정론적)
- [x] P3-T2 Behavior 실행 루프 + Instance State 관리
- [x] P3-T3 표준 Behavior의 회로 기여와 GPIO 이벤트 (저항·LED·GPIO 핀 구동)
- [x] P3-T4 DC 회로 Solver v0 (노드 해석: 저항·구동원 + 구간 선형 다이오드)
- [x] P3-T5 MCU 프로그램 런타임 (JS, `pinMode/digitalWrite/digitalRead/delay/millis`)
- [x] P3-T6 결과 기록 (시계열 trace, 이벤트 로그) + JSON 출력
- [x] P3-T7 CLI: `physisim validate|run <system.json> --duration 2s`
- [x] P3-T8 E2E: Blink 예제에서 LED 밝기가 1Hz로 토글되는지 테스트

🔶 결정 게이트
- ~~G3-1 시간 모델~~ → 혼합
- ~~G3-2 회로 해석~~ → 직접 구현
- ~~G3-3 MCU 코드~~ → JS 스크립트 + Arduino식 API

**완료 기준**: `physisim run examples/blink-led.system.json`이 재현 가능한 trace를 출력.

---

## Phase 4 — Agent v1: 파일 기반 (`@physisim/cli`)

**목표**: 스펙 §10.1 — AI 코딩 에이전트가 파일을 수정하면 PhysiSim이 감지해 자동 반영한다. 전용 프로토콜(MCP)은 만들지 않는다.

- [x] P4-T1 로컬 라이브러리: System 문서의 `library`로 사용자 Model/Capability JSON을 불러와 표준 라이브러리와 함께 검증
- [x] P4-T2 `physisim models [검색어] [--json]`: 부품·Port·속성·Capability 탐색
- [x] P4-T3 JSON Schema 파일(`schemas/`) 생성과 `$schema` 지원, 최신 상태 테스트
- [x] P4-T4 `physisim watch`: System·프로그램·로컬 Model 변경 시 재검증·재실행
- [x] P4-T5 `docs/AUTHORING.md`: 에이전트용 작성 가이드, AGENTS.md 연결
- [x] P4-T6 시나리오 테스트: 파일 수정 → watch 감지 → 결과 변화

🔶 결정 게이트
- ~~G4-1 Agent 연동 방식~~ → 파일 기반, MCP 보류 (사용자 결정)
- ~~G4-2 Agent의 새 Model 생성~~ → 로컬 Model/Capability JSON 허용, Behavior 코드는 표준만

**완료 기준**: Codex CLI·Claude Code 등에 "LED를 하나 더 달아줘"라고 하면 파일이 수정되고 `physisim watch`에 새 결과가 나타난다.

---

## Phase 5 — 2D System Editor (`apps/web`)

**목표**: 미니멀한 웹 에디터(`docs/DESIGN.md`). 같은 파일을 에이전트와 사람이 함께 편집한다 — 에이전트가 파일을 고치면 화면에 반영되고, 화면에서 고치면 파일에 저장된다. 시뮬레이션은 브라우저 Web Worker에서 돈다.

- [x] P5-T1 앱 골격 (Vite + React), dev 서버 파일 API·변경 알림, 프로젝트 열기
- [x] P5-T2 캔버스: 그리드·팬·줌, 부품 라인아트 자동 생성, System 렌더링
- [x] P5-T3 Web Worker 실시간 시뮬레이션: Run/Pause/Reset, 살아 있는 것만 강조색 (LED 점등, 전류 흐르는 선)
- [x] P5-T4 편집: 부품 패널(검색·추가), 이동·회전·삭제, 핀 단위 배선, 파일에 저장
- [ ] P5-T5 인스펙터: Property Schema로 폼 자동 생성
- [ ] P5-T6 프로그램 편집기 + 시리얼 출력 (`Serial.println`)
- [ ] P5-T7 외부(에이전트) 파일 변경 실시간 반영 E2E 확인

🔶 결정 게이트
- ~~G5-1 UI 프레임워크~~ → React (+ Vite)
- ~~G5-2 캔버스·부품 그래픽~~ → 직접 SVG, 자체 라인아트
- ~~G5-3 저장~~ → 로컬 파일 + dev 서버, 백엔드 없음

**완료 기준**: `pnpm dev` → 브라우저에서 Blink 회로를 처음부터 만들고 실행. 에이전트가 파일을 고치면 화면이 바뀌고, 화면에서 고치면 파일이 바뀐다.

---

## Phase 6 — Electronics 확장

**목표**: BenchTwin 수준의 "실부품처럼 동작하고, 실패할 회로는 실패한다".

- [ ] P6-T1 입력·센서 Model: 버튼, 가변저항, 포토레지스터, 초음파 센서
- [ ] P6-T2 PWM·ADC Capability 및 Behavior
- [ ] P6-T3 모터 드라이버, DC 모터(전기적 모델), 서보
- [ ] P6-T4 고장 모델: 과전류 LED 소손, 과전압 경고 (State·이벤트로 표현)
- [ ] P6-T5 계측기 Model: 멀티미터, 오실로스코프(trace 뷰)
- [ ] P6-T6 비선형 소자 Solver (다이오드 Newton-Raphson) 또는 SPICE 연동
- [ ] P6-T7 두 번째 MCU (ESP32 또는 Pico)로 Capability 재사용·override 검증

🔶 결정 게이트
- G6-1 실제 펌웨어 에뮬레이션(avr8js·rp2040js) 도입 여부와 시점
- G6-2 부품 데이터 확보 방법 (직접 작성 / Fritzing parts(CC-BY-SA) / Agent 생성 후 검수)

**완료 기준**: 버튼으로 LED 토글, 잘못된 저항값에서 LED 소손 이벤트 발생.

---

## Phase 7 — Mechanical & Physics + 3D

**목표**: 스펙 §9.1 — MCU → 회로 → 모터 → 바퀴 → 차체 → 센서 → MCU 폐루프.

- [ ] P7-T0 계층 Composition: System을 Model로 감싸 Port 노출 (Phase 2에서 이동)
- [ ] P7-T1 기계 Model 스키마: Body(질량·관성·형상), Joint, Gear, Wheel
- [ ] P7-T2 물리 엔진 어댑터 (Domain Solver 인터페이스 뒤에 숨김)
- [ ] P7-T3 전기↔기계 결합: 모터 토크·역기전력
- [ ] P7-T4 도메인 Solver 간 co-simulation 스텝 조정
- [ ] P7-T5 3D 뷰어 (조립·실행 화면), 환경(바닥·장애물·라인)
- [ ] P7-T6 데모: 초음파 센서로 장애물 회피하는 2륜 로봇

🔶 결정 게이트
- G7-1 물리 엔진: Rapier / Jolt / cannon-es
- G7-2 기계 Model 포맷: 자체 스키마 vs URDF/MJCF 가져오기 지원
- G7-3 3D 렌더러: three.js 직접 vs react-three-fiber

**완료 기준**: 헤드리스와 3D 뷰어 양쪽에서 같은 결과(결정론)로 로봇 폐루프 동작.

---

## Phase 8 — Control & Agent v2

- [ ] P8-T1 Control 도메인 Model: PID 컨트롤러 (블록 Behavior)
- [ ] P8-T2 라인트레이서 데모 (PID 게인 튜닝)
- [ ] P8-T3 Agent 분석 tool: 실행 결과 비교, 파라미터 스윕
- [ ] P8-T4 Agent 개선 제안 루프 (예: PID 게인 자동 탐색)
- [ ] P8-T5 Agent의 Model 작성 + 스키마 검증 + 사용자 승인 흐름

🔶 결정 게이트
- G8-1 PLC(래더 등) 지원 범위
- G8-2 블록 코딩 도입 여부

---

## Phase 9 — Model Editor & 생태계

- [ ] P9-T1 Model Editor UI (Property Schema·Capability 바인딩 편집)
- [ ] P9-T2 BOM / 부품 리스트 내보내기
- [ ] P9-T3 Model 패키지 가져오기·내보내기, 버전 관리
- [ ] P9-T4 System 공유 링크

🔶 결정 게이트
- G9-1 계정·백엔드·공유 범위
- G9-2 커뮤니티 Model 라이브러리 운영 방식

---

## 진행 규칙

- Phase 시작 시 해당 Phase의 결정 게이트를 먼저 질문하고, 답을 스펙 §12에 기록한 뒤 착수한다.
- Task는 진행하며 쪼개거나 합칠 수 있다(사용자에게 보고). Phase 추가·순서 변경은 질문.
- Phase 완료 시 마일스톤 데모를 `examples/`에 남기고, 이 문서의 체크박스와 한눈에 보기 표를 갱신한다.
