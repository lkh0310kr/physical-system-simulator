/** ATmega328P 기반 Arduino 보드(UNO·Nano)의 디지털 핀 번호 → 포트·비트 (Arduino 코어 variants/standard). */
export type PortName = "B" | "C" | "D";

export interface PinMap {
  readonly port: PortName;
  readonly bit: number;
}

/** D0–D7 = PD0–7, D8–D13 = PB0–5, D14–D19(A0–A5) = PC0–5. */
export const ATMEGA328P_ARDUINO_PINS: readonly PinMap[] = [
  ...Array.from({ length: 8 }, (_, bit) => ({ port: "D" as const, bit })),
  ...Array.from({ length: 6 }, (_, bit) => ({ port: "B" as const, bit })),
  ...Array.from({ length: 6 }, (_, bit) => ({ port: "C" as const, bit })),
];
