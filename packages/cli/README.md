# @physisim/cli

```bash
pnpm physisim validate examples/blink-led.system.json
pnpm physisim run examples/blink-led.system.json --duration 2s
pnpm physisim run examples/blink-led.system.json --json > trace.json
```

진입점: `src/main.ts` (인자 처리·출력), `src/simulate.ts` (파일 → 시뮬레이션 결과, 테스트·재사용용).
