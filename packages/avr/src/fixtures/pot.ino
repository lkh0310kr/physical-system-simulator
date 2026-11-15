// A0의 가변저항 값을 읽어 Serial로 보낸다.
void setup() {
  Serial.begin(9600);
}

void loop() {
  Serial.println(analogRead(A0));
  delay(100);
}
