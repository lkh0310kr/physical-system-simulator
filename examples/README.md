# Examples

System 문서 예제. 형식은 `@physisim/core`의 `SystemSchema`, 부품은 `@physisim/models` 표준 라이브러리.
모든 예제는 `packages/models/src/examples.test.ts`에서 빌드 검증된다.

```bash
pnpm physisim run examples/blink-led.system.json --duration 2s
```

| 파일 | 내용 |
|---|---|
| `blink-led.system.json` | Arduino UNO D13 → 220Ω → LED → GND, 프로그램 `blink.ino` |
| `blink.ino` | Arduino 스케치: 0.5초마다 D13 토글, Serial 출력 (실행에 arduino-cli 필요) |
| `button-led.system.json` | 버튼(INPUT_PULLUP) → LED, 프로그램 `button.ino` |
| `camera-case-*.system.json` | 웨어러블 카메라 노드 시나리오 비교(A-2·A-3·B), `camera-case-xiao-s3-sense`는 실제 보드 + 케이스 생성(`physisim case`) |
| `tactile-led.system.json` | 12 mm 택트 스위치: 플런저가 작동점까지 눌려야 접점이 닫혀 LED가 켜진다 (3D에서 클릭) |
| `robot-drive.system.json` | 배터리 → TT 모터 → 바퀴 → 2륜 차체 (기계 Net, 3D에서 달림) |
| `robot-avoid.system.json` | 초음파 센서 → 제어기 → H-브리지 → 모터 → 차체: 벽 앞에서 돌아 피한다 (전기·기계·신호) |
| `motor-pid.system.json` | PID 모터 속도 제어 (`physisim tune`으로 이득 탐색) |
| `line-follower.system.json` | 선 센서 → PID → 조향 믹서 → 모터: 바닥 사인 곡선을 따라간다 |
