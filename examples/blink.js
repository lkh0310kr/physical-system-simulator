// Arduino Blink — D13의 LED를 0.5초마다 켜고 끈다.
// delay는 yield와 함께 써서 시뮬레이션 시간을 양보한다.

function setup() {
  pinMode(13, OUTPUT);
}

function* loop() {
  digitalWrite(13, HIGH);
  yield delay(500);
  digitalWrite(13, LOW);
  yield delay(500);
}
