# 참고 서비스·프로젝트·오픈소스 분석

> 최종 갱신: 2026-11-15. 새 기능 설계 전 관련 항목을 확인하고, 조사한 내용은 여기에 추가한다.
> 라이선스 규칙은 `AGENTS.md` §5를 따른다.

## 1. 상용/서비스 벤치마크

### BenchTwin — https://benchtwin.com
브라우저 기반 3D 마이크로컨트롤러·로보틱스 시뮬레이터 (베타, 정식 출시는 2027-01로 알려짐).

- Arduino, ESP32, ESP8266, RP2040(Pico), STM32 등 다수 MCU, 9,000+ 실부품 라이브러리
- 3D 벤치에서 핀 단위 배선, 실제 Arduino 코드 실행·라이브 디버깅
- **"현실에서 실패하는 회로는 시뮬레이터에서도 실패한다"** — 과전압 등 고장 시뮬레이션
- 멀티미터·오실로스코프 등 계측기, 로봇 경기장(LEGO SPIKE, VEX, FTC, FRC)
- 부품·나사·라이브러리 **쇼핑 리스트(BOM)** 생성, STL 내보내기
- ToS: 시뮬레이션은 학습·계획용 근사치임을 명시

**PhysiSim 차용 포인트**
- 고장 상태(파손, 과열)를 Behavior 출력·Instance State로 모델링 → Phase 6
- 계측기도 Model로 정의(측정 Capability) → Phase 6
- Composition에서 BOM 자동 생성 → Phase 9
- 정확도 한계를 Model Metadata(데이터 출처, 신뢰도)로 표기 → Phase 1 Metadata 스키마

### Constructa (AtumX) — https://constructa-page.atumx.in
> 참고: `constructa.io` 도메인은 현재 매물 상태이며, 실제 서비스는 AtumX 도메인에서 운영된다.

브라우저 기반 3D 로봇 워크숍. 로봇을 **조립 → 배선 → 코딩 → 물리 실행(대결)** 하는 흐름. 데스크톱 전용, 청소년·입문자 대상. 온라인 대회(Constructathon)에서 사용.
오픈소스 유사 프로젝트: `github.com/yogesh15188/constructa-iot` (3D IoT & Robotics Studio + AI Copilot).

**PhysiSim 차용 포인트**
- 전자 Composition과 기계 Composition이 하나의 System으로 이어지는 UX → Phase 7
- "만들고 바로 돌려본다"는 짧은 피드백 루프 → 에디터 Run 버튼 설계
- AI Copilot이 조립을 돕는 패턴 → Phase 4/8 Agent

### Tinkercad Circuits (Autodesk) — https://www.tinkercad.com/circuits
초보자용 2D 브레드보드 회로 시뮬레이터.

- 드래그&드롭 부품 패널, 브레드보드, 와이어 색상
- Arduino 코드: **블록 코딩(Codeblocks)** ↔ 텍스트 코드 동시 보기, 시리얼 모니터
- 스타터 회로 템플릿, 부품 속성 인스펙터(저항값 등), 시뮬레이션 시작/정지

**PhysiSim 차용 포인트**
- 2D System Editor의 기본 UX (부품 패널 / 캔버스 / 인스펙터 / Run) → Phase 5
- 스타터 템플릿 = 사전 정의된 Composition 예제 → Phase 5
- 블록 코딩은 Behavior 스크립트의 입문용 표현으로 검토 → Phase 8 이후

## 2. 오픈소스 — 전자·MCU

| 프로젝트 | 라이선스 | 내용 | 차용 포인트 |
|---|---|---|---|
| **Wokwi `diagram.json`** 포맷 | (포맷) | `parts[{type,id,top,left,attrs}]`, `connections[[from,to,color,routing]]` (`led1:A` 같은 `부품:핀` 표기) | System 문서 포맷 설계의 1차 참고 → Phase 2 |
| **avr8js** (wokwi) | MIT | 브라우저 AVR(ATmega328P) 명령어 에뮬레이터 | 실제 펌웨어 실행 옵션 → Phase 6 결정 게이트 |
| **rp2040js** (wokwi) | MIT | RP2040 에뮬레이터 | 동일 |
| **wokwi-elements** | MIT | LED, 버튼, 보드 등 Web Components 부품 그래픽 | 2D 에디터 부품 렌더링 → Phase 5 |
| **Velxio** | (확인 필요) | Wokwi 대안. avr8js + rp2040js + ngspice-WASM(eecircuit-engine) 조합 | 디지털 MCU + 아날로그 SPICE 결합 구조 참고 |
| **EEcircuit / eecircuit-engine** | (확인 필요) | ngspice를 WASM으로 컴파일한 브라우저 SPICE | 정밀 회로 해석 백엔드 후보 → Phase 3/6 |
| **ngspice** | BSD 계열 | 업계 표준 SPICE | 위와 동일 |
| **Falstad CircuitJS1** | **GPL** | 실시간 MNA 회로 시뮬레이터 | 알고리즘(MNA, 비선형 소자 반복 해법)만 참고, 코드 사용 금지 |
| **SimulIDE** | **GPL** | MCU + 회로 혼합 시뮬레이터 | 설계 참고만 |
| **Fritzing parts** | **CC-BY-SA** | 부품 메타데이터(.fzp: 핀/커넥터 정의), SVG | 핀 정의 구조 참고. 데이터 사용 시 사용자 결정 필요 |

## 3. 오픈소스/표준 — 모델링·Composition

| 대상 | 차용 포인트 |
|---|---|
| **Modelica / OpenModelica** | Connector(Port)에 **across 변수(전압, 위치)** 와 **through 변수(전류, 힘)** 를 두는 acausal 연결 → 도메인 무관 Port 설계. `replaceable` → 스펙 §14 A' 근거 |
| **FMI / FMU (Co-Simulation)** | 도메인별 Solver를 독립 단위로 두고 고정 통신 스텝으로 값 교환 → Phase 7 도메인 결합 |
| **URDF / SDF / MJCF(MuJoCo)** | Link(Body)–Joint 트리, 관성·충돌 형상 기술 → 기계 Model 스키마 → Phase 7 |
| **SysML v2** | Part/Port/Connection/Interface 개념 정리 → Composition 용어 정합성 |

## 4. 오픈소스 — 물리·렌더링

| 프로젝트 | 라이선스 | 용도 |
|---|---|---|
| **Rapier** (`@dimforge/rapier3d`) | Apache-2.0 | WASM 강체 물리, 관절, 결정론 모드 → Phase 7 1순위 후보 |
| Jolt Physics (WASM) | MIT | 대안 |
| cannon-es | MIT | 가벼운 JS 대안 |
| **three.js / react-three-fiber** | MIT | 3D 뷰어 → Phase 7 |
| React Flow (xyflow) | MIT | 노드·배선 기반 2D 에디터 후보 → Phase 5 |

## 5. 단위·스키마·Agent

| 대상 | 라이선스 | 용도 |
|---|---|---|
| **Zod v4** | MIT | 런타임 스키마, `z.toJSONSchema()` (확정, 스펙 §15) |
| js-quantities / mathjs units | MIT / Apache-2.0 | 물리 단위 후보 (Phase 1 결정 게이트) |
| **Model Context Protocol (MCP)** + TS SDK | MIT | Agent tool 노출 → Phase 4 |

## 6. PhysiSim의 차별점 (벤치마크 대비)

| | BenchTwin / Tinkercad / Wokwi | Constructa | **PhysiSim** |
|---|---|---|---|
| 중심 | 부품·회로 | 로봇 조립 | **Model(데이터)** |
| 확장 | 벤더가 부품 추가 | 벤더가 부품 추가 | Model·Capability·Behavior를 JSON+코드로 누구나 추가 |
| 도메인 | 전자 위주 (+로봇) | 로봇 | 전자·전기·기계·물리·제어 통합 |
| AI | 보조 기능 | Copilot | **Agent가 1급 사용자** (탐색·구성·실행·분석 API) |
| 실행 | 브라우저 UI 중심 | 브라우저 UI | Headless 코어 → CLI·Agent·UI 공용 |

## 출처

- BenchTwin: https://benchtwin.com/ , https://benchtwin.com/about/ , https://benchtwin.com/terms/
- Constructa: https://constructa-page.atumx.in/ , https://github.com/yogesh15188/constructa-iot , https://constructa.io/ (도메인 매물)
- avr8js: https://blog.wokwi.com/avr8js-simulate-arduino-in-javascript/
- Velxio: https://forum.arduino.cc/t/velxio-an-open-source-arduino-rp2040-emulator-running-entirely-in-the-browser/1434847
- EEcircuit: https://github.com/eelab-dev/EEcircuit
- OpenHW Studio simulation engine: https://openhw-studio.fossee.in/docs/references/simulation-engine.html
