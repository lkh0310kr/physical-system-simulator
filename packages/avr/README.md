# @physisim/avr

컴파일된 Arduino(ATmega328P) 펌웨어를 avr8js(MIT)로 시뮬레이션 안에서 실행한다. 컴파일은 하지 않는다 — hex를 받는다.

진입점: `src/firmware.ts` (`loadFirmware(sim, instance, hex)`), 예제는 `src/firmware.test.ts`.
