# 테스트 픽스처

CI에는 arduino-cli가 없으므로 미리 컴파일한 펌웨어를 둔다. 스케치를 바꾸면 다시 만든다:

```bash
arduino-cli compile --fqbn arduino:avr:uno --output-dir /tmp/out <스케치 폴더>
cp /tmp/out/blink.ino.hex src/fixtures/blink.hex
```

- `blink.ino` / `blink.hex`: D13을 500ms마다 토글하고 Serial로 "on"/"off" 출력 (arduino:avr 1.8.8)
