// D9에 PWM 듀티 25%(64/255)를 낸다. D9는 Timer1 출력으로 약 490Hz.
void setup() {
  pinMode(9, OUTPUT);
  analogWrite(9, 64);
}

void loop() {}
