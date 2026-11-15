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
