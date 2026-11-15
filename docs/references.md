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
| **avr8js** (wokwi) | MIT | 브라우저 AVR(ATmega328P) 명령어 에뮬레이터 | **도입 (v0.11)** — `@physisim/avr`에서 .ino 펌웨어 실행 |
| **arduino-cli** | GPL-3 (외부 도구) | Arduino 공식 CLI 컴파일러 | **도입 (v0.11)** — 명령으로 호출만 함, 저장소에 포함·링크하지 않음 |
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

## 3D 표현 조사 (2026-11-15, Phase 7d)

| 대상 | 확인한 것 | 우리 프로젝트에 적용 |
|---|---|---|
| BenchTwin (benchtwin.com, 직접 열어 봄) | 어두운 벤치 바닥 + 격자, 실제 부품(브레드보드·Arduino·OLED·서보)을 세부 형상으로 표현, 전선이 곡선 케이블로 3D 배선, 화면 부품은 실시간 동작 | 세부 형상(`body.parts`), 바닥 그림자, 금속 반사. 케이블 3D는 후속 |
| Constructa | constructa.io가 만료·주차 상태라 사이트를 못 열었다. 이전 조사(조립→배선→코딩→실행 흐름)만 유효 | 직접 확인 못 함 — 표현 기법은 근거 없음 |
| Tinkercad Circuits | 회로 편집기는 2D. 3D는 별도 3D 디자인 편집기에서 부품 둘레에 맞는 형상을 만드는 쪽 | 우리는 3D 조립 + 케이스 생성으로 두 흐름을 한 문서에 합친다 |
| react-three-fiber / drei 커뮤니티 문서 | 이미지 기반 조명(Environment)이 PBR 반사의 핵심, ContactShadows·Stage는 접지감, HDR은 PMREM 처리 후 환경으로 사용 | three 내장 `RoomEnvironment` + PMREM + 그림자 판으로 같은 효과를 의존성 없이 구현 (drei 미도입) |
| Claude Code로 3D 만들기(커뮤니티 글) | 렌더를 스크린샷으로 찍어 되먹임하는 루프가 핵심. "검증했다"고 말만 하는 실패 사례가 있어 실제 화면 증거를 요구해야 함 | 개발 중 브라우저로 직접 3D 화면을 보고 고친다 (이번 작업이 그 방식) |
| realvirtual WEB | 브라우저 3D HMI, 렌더·시뮬레이션이 사용자 기기에서 동작 (AGPL — 코드는 안 가져옴) | 구조 참고만 |

실제 부품 형상: Seeed XIAO 모듈은 공식 STEP의 **부품별 치수**만 옮겨 프리미티브로 구성했다 (STEP 메시를 배포하지 않으므로 라이선스 문제 없음).

## 원본 3D 메시 사용 (P7-T24)

| 파일 | 출처 | 변환 |
|---|---|---|
| `apps/web/public/meshes/xiao-esp32s3-sense.glb` | Seeed Studio 공식 STEP (`seeed-studio-xiao-esp32s3-sense-3d_model.zip`, 2023-05) | `tools/step-to-glb.py` (cadquery/OpenCascade, 개발 환경에서만 사용): 면 색 유지, 편향 0.05 mm, PhysiSim body 좌표(m, z 위)로 변환 |

사용 허락: 사용자가 2026-11-15에 확인(라이선스 문제 없음으로 판단). 원본 STEP·PDF는 계속 저장소에 올리지 않는다(`datasheets/`). 변환본에는 출처를 `metadata.source`에 남긴다. 색은 STEP에 들어 있는 값 그대로이고 PBR 재질 값은 렌더 추정이다.
| `apps/web/public/meshes/lipo-adafruit-1317.glb` | [adafruit/Adafruit_CAD_Parts](https://github.com/adafruit/Adafruit_CAD_Parts) `1317 150mAh Lipo Battery.step` (저장소 라이선스 MIT) | 같은 도구, `--map Y,-X,Z`. 외곽 26.02×19.75×3.8 mm가 제품 페이지 치수와 일치 |
| `apps/web/public/meshes/servo-mg996r.glb` | GitHub 제3자 STEP `MG996R.step` (N3MI-DG/Filler3 `CQ-SRC/imports/`; blackfyre/spooder 등에 다른 판본). 귀 포함 54 mm·폭 19.8 mm가 데이터시트와 일치. 라이선스 미확인 — 사용자가 2026-11-16에 "라이선스 상관없음"으로 허락 | `tools/step-to-glb.py`, 혼 고정 포함 |
| `apps/web/public/meshes/servo-sg92r.glb` | GitHub 제3자 STEP `SG92R.step` (Azuma413/6dof_arm_cad 등, 같은 파일). 라이선스 미확인(위와 같은 허락) | 같은 도구 `--map X,Y,Z` |
| `apps/web/public/meshes/arduino-uno-metro328.glb` | [adafruit/Adafruit_CAD_Parts](https://github.com/adafruit/Adafruit_CAD_Parts) `2488 Adafruit Metro 328.step` (MIT). Uno R3 규격 호환 보드의 대용 — 실제 Uno와 커넥터 모양이 다를 수 있음 | 같은 도구 `--map X,Y,Z` |
| `apps/web/public/meshes/pca9685-adafruit-815.glb` | Adafruit_CAD_Parts `815 Servo Driver 16 Channel.step` (MIT). 아직 Model에 연결하지 않음 | 같은 도구 `--map X,Y,Z` |
