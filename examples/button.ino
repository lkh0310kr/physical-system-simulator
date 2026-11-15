// 버튼을 누르는 동안 D13 LED를 켠다. 버튼은 D2 ↔ GND, 내부 풀업 사용.
void setup() {
  pinMode(2, INPUT_PULLUP);
  pinMode(13, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  bool pressed = digitalRead(2) == LOW;
  digitalWrite(13, pressed ? HIGH : LOW);
  Serial.println(pressed ? "pressed" : "released");
  delay(100);
}
