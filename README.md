# physical-system-simulator

AI 에이전트 기반 로봇, 하드웨어, 회로, 물리 시뮬레이션 플랫폼 — **PhysiSim**.

부품(Model)을 데이터로 정의하고, 조합해 시스템을 만들고, 시뮬레이션한다. 사람은 웹 에디터로, AI 코딩 에이전트(Codex CLI, Claude Code 등)는 같은 파일을 직접 고쳐서 함께 작업한다.

## 시작

```bash
brew install arduino-cli && arduino-cli core install arduino:avr   # Arduino 스케치 컴파일용
pnpm install
pnpm dev                                    # 웹 에디터 → http://localhost:5173 (examples/ 폴더를 연다)
PHYSISIM_PROJECT=./my-project pnpm dev      # 다른 폴더 열기
```

- 캔버스: 드래그로 이동, 핀에서 핀으로 드래그해 배선, `R` 회전, `Delete` 삭제, `⌘Z` 되돌리기, `Space` 실행/정지
- 왼쪽 `추가`로 부품, `코드`로 Arduino 스케치(.ino) 편집·시리얼 출력 — 실제 펌웨어를 컴파일해 실행한다
- 에디터에서 고치면 파일에 저장되고, 에이전트가 파일을 고치면 화면에 바로 반영된다

## 데모 (웹 에디터에서 `3D` → `실행`)

| 열 주소 | 무엇을 보나 |
|---|---|
| `?system=camera-case-xiao-s3-sense.system.json` | 실제 카메라 보드 + 배터리에 맞춘 케이스(`케이스`, 단면, 분해, 출력 배치, STL/3MF 내려받기) |
| `?system=tactile-led.system.json` | 12 mm 택트 스위치 플런저를 클릭해 누르면 접점이 닫혀 LED가 켜진다 |
| `?system=robot-avoid.system.json` | 초음파 센서로 벽 앞에서 돌아 피하는 2륜 로봇 (카메라가 따라간다) |
| `?system=line-follower.system.json` | PID 조향으로 바닥 사인 곡선을 따라가는 로봇 |
| `?system=motor-pid.system.json` | PID 모터 속도 제어 (`스코프`로 파형 보기) |

## CLI

```bash
pnpm physisim models led                                   # 부품 찾기
pnpm physisim run examples/blink-led.system.json --duration 2s
pnpm physisim watch examples/blink-led.system.json         # 파일이 바뀔 때마다 다시 실행
pnpm physisim case examples/camera-case-xiao-s3-sense.system.json            # 케이스 STL/3MF + BOM (out/)
pnpm physisim report examples/camera-case-a2-ov2640.system.json --press btn@1s   # 촬영 지연·에너지·배터리 수명
pnpm physisim sweep examples/blink-led.system.json --set r1.resistance=100,220,1000 --watch led1.brightness   # 값 바꿔 비교
pnpm physisim tune examples/motor-pid.system.json --range ctrl.ki=0.05..5 --minimize ctrl.ise --stat final      # 제약 하 최적값 탐색
pnpm physisim check my-part.model.json                     # 새 부품 정의 검증 + 사람이 확인할 항목
```

## 문서

| 문서 | 내용 |
|---|---|
| [docs/AUTHORING.md](docs/AUTHORING.md) | 시스템·프로그램·부품 파일 작성법 (에이전트용) |
| [docs/spec/PhysiSim_Specification.md](docs/spec/PhysiSim_Specification.md) | 목표·구조·확정된 결정 |
| [docs/PHASE_PLAN.md](docs/PHASE_PLAN.md) | 단계별 계획 |
| [docs/DESIGN.md](docs/DESIGN.md) | 개발·디자인 철학 |
| [AGENTS.md](AGENTS.md) | 이 저장소에서 개발하는 에이전트를 위한 규칙 |

MIT License
