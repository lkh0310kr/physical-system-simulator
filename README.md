# physical-system-simulator

AI 에이전트 기반 로봇, 하드웨어, 회로, 물리 시뮬레이션 플랫폼 — **PhysiSim**.

부품(Model)을 데이터로 정의하고, 조합해 시스템을 만들고, 시뮬레이션한다. 사람은 웹 에디터로, AI 코딩 에이전트(Codex CLI, Claude Code 등)는 같은 파일을 직접 고쳐서 함께 작업한다.

## 시작

```bash
pnpm install
pnpm dev                                    # 웹 에디터 → http://localhost:5173 (examples/ 폴더를 연다)
PHYSISIM_PROJECT=./my-project pnpm dev      # 다른 폴더 열기
```

- 캔버스: 드래그로 이동, 핀에서 핀으로 드래그해 배선, `R` 회전, `Delete` 삭제, `⌘Z` 되돌리기, `Space` 실행/정지
- 왼쪽 `추가`로 부품, `코드`로 MCU 프로그램·시리얼 출력
- 에디터에서 고치면 파일에 저장되고, 에이전트가 파일을 고치면 화면에 바로 반영된다

## CLI

```bash
pnpm physisim models led                                   # 부품 찾기
pnpm physisim run examples/blink-led.system.json --duration 2s
pnpm physisim watch examples/blink-led.system.json         # 파일이 바뀔 때마다 다시 실행
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
