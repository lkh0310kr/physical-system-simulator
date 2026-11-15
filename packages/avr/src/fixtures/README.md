# 테스트 픽스처

CI에는 arduino-cli가 없으므로 미리 컴파일한 펌웨어를 둔다. 스케치를 바꾸면 다시 만든다:

```bash
arduino-cli compile --fqbn arduino:avr:uno --output-dir /tmp/out <스케치 폴더>
cp /tmp/out/blink.ino.hex src/fixtures/blink.hex
```

- `blink.ino` / `blink.hex`: D13을 500ms마다 토글하고 Serial로 "on"/"off" 출력 (arduino:avr 1.8.8)
- `pullup.ino` / `pullup.hex`: D2를 INPUT_PULLUP으로 두고 200ms마다 digitalRead 값을 Serial로 출력
- `button.ino` / `button.hex`: examples/button.ino와 같다. D2 버튼(INPUT_PULLUP) → D13 LED
- `pot.ino` / `pot.hex`: A0를 analogRead해 100ms마다 Serial로 출력
- `pwm.ino` / `pwm.hex`: D9에 analogWrite(9, 64) — 듀티 약 25%, 약 490Hz
