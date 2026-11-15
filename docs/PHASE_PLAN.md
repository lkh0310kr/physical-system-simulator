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
- [x] P5-T5 인스펙터: Property Schema로 폼 자동 생성
- [x] P5-T6 프로그램 편집기 + 시리얼 출력 (`Serial.println`)
- [x] P5-T7 외부(에이전트) 파일 변경 실시간 반영 E2E 확인

🔶 결정 게이트
- ~~G5-1 UI 프레임워크~~ → React (+ Vite)
- ~~G5-2 캔버스·부품 그래픽~~ → 직접 SVG, 자체 라인아트
- ~~G5-3 저장~~ → 로컬 파일 + dev 서버, 백엔드 없음

**완료 기준**: `pnpm dev` → 브라우저에서 Blink 회로를 처음부터 만들고 실행. 에이전트가 파일을 고치면 화면이 바뀌고, 화면에서 고치면 파일이 바뀐다.

---

## Phase 6 — Electronics 확장

**목표**: BenchTwin 수준의 "실부품처럼 동작하고, 실패할 회로는 실패한다".

**6a — Arduino 실펌웨어 (사용자 결정으로 먼저 진행)**

- [x] P6-T0a `@physisim/avr`: avr8js로 ATmega328P 펌웨어 실행, 포트 ↔ GPIO 이벤트, USART ↔ 시리얼
- [x] P6-T0b 스케치 컴파일 (arduino-cli, 캐시, 오류를 파일·줄 위치로)
- [x] P6-T0c CLI·dev 서버·웹에서 `.ino` 프로그램 실행·편집
- [x] P6-T0d 예제를 `blink.ino`로, 미리 컴파일한 hex로 CI E2E, 작성 가이드 갱신

**6b — 부품·계측·고장** (부품 데이터는 직접 작성 + 에이전트 보조, 출처는 `metadata.source`)

- [x] P6-T1a 풀업: `INPUT_PULLUP` 핀이 회로에서 약 20kΩ으로 5V에 당겨지게 (지금은 떠 있는 핀이 0으로 읽힘)
- [x] P6-T1b 스위치(버튼) Model, 캔버스에서 클릭으로 누르기
- [x] P6-T2 가변저항 Model + ADC 연결 (`analogRead`)
- [x] P6-T3 PWM 출력: `analogWrite` → 평균 전압으로 LED 밝기


- [ ] P6-T1c 센서 Model: 포토레지스터 (초음파 센서는 P7-T11에서 완료: Adafruit 4007)
- [ ] P6-T3b 모터 드라이버, 서보 (DC 모터는 P7-T9에서 완료: Adafruit 3777 TT 모터)
- [x] P6-T4 고장 모델: 과전류 LED 소손(절대 최대 전류 초과 지속 → 개방, 3D에서 탄 색·"소손" 표시). 과전압 경고는 후속
- [x] P6-T5 계측기: 멀티미터 DC 전압(입력 저항 부하 효과 포함), 웹 스코프 패널(신호 선택, 최근 5초 파형). 전류·저항 측정은 후속
- [ ] P6-T6 비선형 소자 Solver (다이오드 Newton-Raphson) 또는 SPICE 연동
- [ ] P6-T7 두 번째 MCU (ESP32 또는 Pico)로 Capability 재사용·override 검증

🔶 결정 게이트
- ~~G6-1 실제 펌웨어 에뮬레이션~~ → avr8js로 지금 도입 (사용자 결정). rp2040js 등 다른 MCU는 그때 결정
- ~~G6-2 부품 데이터~~ → 직접 작성 + 에이전트 보조 (사용자 결정)

**완료 기준**: 버튼으로 LED 토글, 잘못된 저항값에서 LED 소손 이벤트 발생.

---

## Phase 7 — Mechanical, 3D (목표: full 3D에서 기구와 하드웨어 흐름이 연결돼 작동)

**7a 조립 + 실시간 연동 (첫 마일스톤, 사용자 결정)** — 카메라 제품을 3D에 실치수로 조립하고, 같은 시뮬레이션이 3D에 보이게 한다.

- [ ] P7-T1 기구 스키마: Model `body`(크기·질량·형상 참조)와 `mounts`(장착점), System `assembly`(3D 위치·회전). 단위 mm
- [x] P7-T2 3D 뷰어(`apps/web`): three.js + react-three-fiber, 조립 렌더링, 궤도 카메라, 2D 캔버스와 전환
- [x] P7-T3 실시간 연동: 같은 Worker 시뮬레이션 상태(절전·촬영·전송, 전류, LED)를 3D 부품 색·발광으로 표시, 3D에서 버튼 클릭 → 회로 실행
- [x] P7-T4 크기·간섭 검사: 외곽 상자, 부품 간 겹침, 케이스 안에 들어가는지, 케이스별 부피
- [x] P7-T5 카메라 제품 조립: 실치수(데이터시트 패키지 크기)로 Case A/B 조립, 비교 표에 크기·부피 추가
- [x] P7-T6 제작사 CAD(STEP) → glb 변환(`tools/step-to-glb.py`)과 뷰어 로딩 (STL 직접 가져오기는 후속)

**7b 움직이는 기구 (Rapier 도입)**

- [ ] P7-T7 물리 엔진 어댑터(Rapier, Domain Solver 인터페이스 뒤)와 결정론 검증
- [ ] P7-T8 관절·스프링: 버튼 플런저 ✓(이동 거리·작동점·히스테리시스가 접점을 구동, 3D 플런저 이동, Omron B3F 값), 힌지·슬라이더는 후속
- [x] P7-T9 전기↔기계 결합: 기계 Net(축 각속도 공유), 모터 토크·역기전력, 모터 → 바퀴 → 2륜 차체 위치·방향, 3D에서 차체와 부착 부품이 움직이고 카메라가 따라감
- [ ] P7-T10 도메인 Solver 간 co-simulation 스텝 조정 (현재: 회로 → 기계 → Behavior 순서로 매 스텝 한 번씩, 신호 선은 1 스텝 지연. 충돌·접촉이 필요한 Rapier 도입 시 재검토)
- [x] P7-T11 데모: 초음파 센서로 장애물을 피하는 2륜 로봇 (`examples/robot-avoid.system.json`: 센서 4007·모터 3777 제품 값, 신호 선으로 센서→제어기→드라이버, 3D에서 달리고 피함)
- [ ] P7-T12 계층 Composition: System을 Model로 감싸 Port 노출

🔶 결정 게이트
- ~~G7-1 물리 엔진~~ → Rapier (7b에서 도입)
- ~~G7-2 기구 포맷~~ → 자체 스키마 + glTF/STL
- ~~G7-3 3D 렌더러~~ → three.js + react-three-fiber

**완료 기준 (7a)**: 3D 화면에서 Case A 제품을 실치수로 조립해 보고, 버튼을 눌러 절전→촬영→전송 흐름이 3D 위의 부품 상태로 나타난다.

---

## Phase 7c — 제작 가능한 산출물 (목표: 보고 바로 제작)

사용자 목표(2026-11-15): 3D 모델을 보고 바로 실제 제작할 수 있는 수준. 시작점은 **실제 판매 카메라 보드**이고, 칩 패키지가 아니라 **실제 모듈·보드의 확인된 치수**로 케이스를 맞춘다.

- [x] P7-T13 시작 보드 선정과 치수 확인(제품 페이지·데이터시트): 외형, 높이, 렌즈 위치, USB·버튼·안테나, 배터리 연결, 나사 구멍
- [x] P7-T14 manifold-3d 도입: 불리언(합·차), 메시를 STL/3MF로 쓰기, 형상 검증(닫힌 입체인지)
- [x] P7-T15 공정 프로필(`FDM` 기본): 최소 벽, 틈새 허용오차, 최소 지름, 브리지 한계를 설정으로 분리
- [x] P7-T16 케이스 생성기: 조립 부품 외곽에 베이스·뚜껑, 렌즈·버튼·USB 개구부, 스냅핏·고정 기둥, 프로필 규칙 적용
- [x] P7-T17 케이스 검증: 부품이 들어가는지, 간섭, 벽 두께, 개구부 위치가 부품과 맞는지 — 실패하면 이유와 함께 거부
- [x] P7-T18 3D 뷰어에서 케이스 표시(단면·투명)와 STL/3MF 내려받기
- [x] P7-T19 BOM·구매 리스트: 모델 출처·부품번호에서 자동 생성 (구매는 사람이 한다)

🔶 결정 게이트
- ~~산출물~~ → 케이스 STL/3MF + BOM 우선 (사용자 결정)
- ~~기하 엔진~~ → manifold-3d
- ~~공정~~ → FDM 기본 프로필 (사용자가 공정을 모르므로 범용 기본)
- ~~시작 하드웨어~~ → 실제 판매 카메라 보드
- 후순위(별도 결정): PCB 외형·구멍 KiCad 내보내기, STEP 내보내기(OpenCascade LGPL)

**완료 기준**: 시작 보드의 케이스(베이스+뚜껑) STL을 생성하고, 검증을 통과하며, 3D에서 보드가 들어간 모습을 보고 그대로 출력할 수 있다.

---

## Phase 7d — 3D 표현 (목표: 보면 실물이라고 알아볼 수 있게)

- [x] P7-T20 조사: BenchTwin 직접 확인, r3f 조명·그림자 기법, Claude Code 시각 검증 루프 (`docs/references.md`)
- [x] P7-T21 부품 세부 형상 `body.parts`(표시 전용 프리미티브 + 재질 분류), XIAO 모듈 적용
- [x] P7-T22 렌더링: 이미지 기반 조명(RoomEnvironment), 부드러운 그림자, PBR 재질, ACES 톤매핑
- [x] P7-T23 배터리 실제 메시, Model `body.pins`와 3D 케이블 (XIAO BAT± 패드 ↔ 배터리 리드, 리드 출구 위치는 가정)
- [x] P7-T24 제작사 STEP → glb 변환(`tools/step-to-glb.py`)과 뷰어 로딩 (XIAO 적용, 사용 허락 확인)
- [x] P7-T27 케이스 뷰의 "출력 배치"(베이스·뒤집은 뚜껑을 베드 위에 나란히)
- [x] P7-T26 케이스 검증이 제작사 실제 형상(glb→manifold)으로도 간섭을 검사 (`--meshes`, 웹은 같은 폴더)
- [x] P7-T25 케이스 뷰: 분해(exploded) 슬라이더(부품 단별로 벌려 케이블도 보임), 부품 이름표(치수 없는 부품은 "가정 크기" 표시)

---

## Phase 7e — 케이스 완성도

- [x] P7-T28 스냅 돌기·홈(`snapBump`, 프로필 설정)과 뚜껑 닫힘 충돌 검사(`lid-clash`)
- [ ] P7-T29 나사 기둥(보드 고정이 필요한 보드용), 보드 지지 리브
- [ ] P7-T30 실제 출력·맞춤 후 프로필 보정 (사람 작업)

---

## Phase 8 — Control & Agent v2

- [x] P8-T1 Control 도메인 Model: 신호 도메인(출력→입력 신호 선, 한 스텝 지연), 반응형 제어기, PID 블록(적분 와인드업 방지, 측정값 미분, ISE 지표)
- [x] P8-T2 라인트레이서 데모 (`examples/line-follower.system.json`: 선 센서 → PID → 조향 믹서 → H-브리지 → 모터 → 차체, `tune`으로 kp 탐색)
- [x] P8-T3 Agent 분석 tool: 파라미터 스윕(`physisim sweep`), 실행 결과 비교(`compare`)
- [x] P8-T4 Agent 개선 제안 루프: `physisim tune`(범위 탐색 + 제약 + 목표, 제안과 근거 표). PID 게인 탐색은 P8-T1(PID Model) 이후
- [x] P8-T5 Agent의 Model 작성 + 스키마 검증(`physisim check`: 오류 + 사람이 확인할 항목) + 사용자 승인(library에 추가)

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

## 중간 목표 — Wearable Camera Node (`docs/scenarios/wearable-camera.md`)

초소형 무선 카메라(버튼 → 촬영 → Wi-Fi 전송)의 설계 케이스 A/B/C/D를 시뮬레이터로 구현·비교한다. 구현 가능성이 생기는 능력부터 Phase에 끌어와 쓴다.

- [x] M1 전력 시뮬레이션 기반: 전원 레일의 전류 측정, 에너지 적분(mAh), 배터리 모델 (Phase 6 계측·전원과 함께)
- [x] M2 절전 상태머신 + 깨우기(버튼 인터럽트): 상태별 전류 프로파일
- [x] M3 카메라 센서·무선 모듈 Behavior (촬영 시간·프레임 크기·전송 시간·전류)
- [x] M4 Case A 시나리오: 버튼 → 촬영 → 전송 → 절전, 전송 1회 에너지와 지연 리포트
- [x] M5 비교 도구(`physisim compare`)와 Case A-2/A-3/B 비교. C는 전기적으로 A/B와 동일(기계 도메인 필요), **D는 보류**(셀룰러 연결 시간 미확인)

🔶 결정 게이트
- ~~G-M1 ESP32-S3~~ → 동작 모델로 추상화 (사용자 결정)
- ~~G-M2 스마트폰·서버·네트워크~~ → 수신 기록(이벤트 싱크)만 남긴다 (사용자 결정)

---

## 진행 규칙

- Phase 시작 시 해당 Phase의 결정 게이트를 먼저 질문하고, 답을 스펙 §12에 기록한 뒤 착수한다.
- Task는 진행하며 쪼개거나 합칠 수 있다(사용자에게 보고). Phase 추가·순서 변경은 질문.
- Phase 완료 시 마일스톤 데모를 `examples/`에 남기고, 이 문서의 체크박스와 한눈에 보기 표를 갱신한다.
