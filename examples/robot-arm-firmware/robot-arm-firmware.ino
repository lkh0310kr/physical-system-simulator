// 로봇팔 펌웨어 (Arduino Uno + PCA9685)
//
// PC에서 Serial(115200)로 줄 명령을 받아 서보 5개를 조정 이동시킨다. 프로토콜은 packages/models/src/arm-protocol.ts와 같다:
//   PING | J a1 a2 a3 a4 a5 | G OPEN|CLOSE | S v | HOME | STOP | STATUS
// 각도는 서보 중앙 기준 [deg]: 베이스·손목 ±90, 어깨·팔꿈치 ±60, 그리퍼 0~57.
//
// 배선: Uno A4(SDA)·A5(SCL) → PCA9685 SDA·SCL, 5 V → VCC(로직), GND 공통.
//       서보 전원(5~6 V, 3 A 이상)은 PCA9685 V+ 단자에 따로 연결 — Uno 5 V 핀으로 서보를 구동하지 않는다.
//       채널: 0 베이스, 1 어깨, 2 팔꿈치, 3 손목, 4 그리퍼.
//
// 라이브러리 없이 Wire로 PCA9685 레지스터를 직접 쓴다 (arduino:avr 코어만으로 컴파일된다).
// !! 펄스폭 ↔ 각도 보정(PULSE_CENTER_US, US_PER_DEG)은 서보마다 다르다 — 실제 서보에서 확인해 고친다.

#include <Wire.h>

const uint8_t PCA_ADDR = 0x40;  // 주소 점퍼를 건드리지 않은 기본값 (보드 설명서로 확인)
const uint8_t MODE1 = 0x00;
const uint8_t PRESCALE = 0xFE;
const uint8_t LED0_ON_L = 0x06;
const float PWM_HZ = 50.0;      // 서보 주기 20 ms

const uint8_t JOINTS = 5;
// 서보 중앙 기준 허용 각도 [최소, 최대] deg
const float LIMIT_MIN[JOINTS] = {-90, -60, -60, -90, 0};
const float LIMIT_MAX[JOINTS] = {90, 60, 60, 90, 57};
const float GRIPPER_CLOSED_DEG = 57;

// 펄스 보정: 중앙 펄스와 도(°)당 펄스폭 [µs]. SG92R: 1.0~2.0 ms ↔ ±90° (Adafruit 설명) → 5.56 µs/deg.
// MG996R: 데이터시트가 약 120°(±60°)라고만 하므로 1.0~2.0 ms ↔ ±60°(8.33 µs/deg)로 시작해 보정한다.
const float PULSE_CENTER_US[JOINTS] = {1500, 1500, 1500, 1500, 1500};
const float US_PER_DEG[JOINTS] = {5.56, 8.33, 8.33, 5.56, 5.56};

float current[JOINTS] = {0, 0, 0, 0, 0};
float target[JOINTS] = {0, 0, 0, 0, 0};
float speedDegPerS = 90;

String line;
unsigned long lastUpdateMs = 0;

void pcaWrite(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(PCA_ADDR);
  Wire.write(reg);
  Wire.write(value);
  Wire.endTransmission();
}

void pcaInit() {
  Wire.begin();
  pcaWrite(MODE1, 0x10);                                           // sleep (프리스케일을 쓰려면 필요)
  pcaWrite(PRESCALE, (uint8_t)(25000000.0 / (4096.0 * PWM_HZ) - 1.0 + 0.5));  // 50 Hz → 121
  pcaWrite(MODE1, 0x20);                                           // wake + auto-increment
  delay(1);
  pcaWrite(MODE1, 0xA0);                                           // restart
}

// 채널의 펄스 폭을 [µs]로 설정 (12비트, 주기 20 ms)
void setPulseUs(uint8_t channel, float us) {
  uint16_t ticks = (uint16_t)(us * 4096.0 * PWM_HZ / 1000000.0 + 0.5);
  Wire.beginTransmission(PCA_ADDR);
  Wire.write(LED0_ON_L + 4 * channel);
  Wire.write(0);
  Wire.write(0);
  Wire.write(ticks & 0xFF);
  Wire.write(ticks >> 8);
  Wire.endTransmission();
}

void writeJoint(uint8_t i) {
  setPulseUs(i, PULSE_CENTER_US[i] + current[i] * US_PER_DEG[i]);
}

bool isMoving() {
  for (uint8_t i = 0; i < JOINTS; i++) {
    if (fabs(target[i] - current[i]) > 1e-6) return true;
  }
  return false;
}

// 가장 먼 관절이 속도 v로, 나머지는 같은 시간에 도착하도록 비례해서 이동
void advance(float dt) {
  float delta[JOINTS];
  float far = 0;
  for (uint8_t i = 0; i < JOINTS; i++) {
    delta[i] = target[i] - current[i];
    if (fabs(delta[i]) > far) far = fabs(delta[i]);
  }
  if (far < 1e-6) return;
  float travel = speedDegPerS * dt;
  for (uint8_t i = 0; i < JOINTS; i++) {
    current[i] = (travel >= far) ? target[i] : current[i] + delta[i] / far * travel;
    writeJoint(i);
  }
}

void statusLine() {
  Serial.print(F("POS"));
  for (uint8_t i = 0; i < JOINTS; i++) {
    Serial.print(' ');
    Serial.print(current[i], 1);
  }
  Serial.print(F(" MOVING "));
  Serial.println(isMoving() ? 1 : 0);
}

void handle(String cmd) {
  cmd.trim();
  cmd.toUpperCase();
  if (cmd == "PING") {
    Serial.println(F("OK PING"));
  } else if (cmd == "HOME") {
    for (uint8_t i = 0; i < JOINTS; i++) target[i] = 0;
    Serial.println(F("OK"));
  } else if (cmd == "STOP") {
    for (uint8_t i = 0; i < JOINTS; i++) target[i] = current[i];
    Serial.println(F("OK"));
  } else if (cmd == "STATUS") {
    statusLine();
  } else if (cmd == "G OPEN" || cmd == "G CLOSE") {
    target[4] = (cmd == "G CLOSE") ? GRIPPER_CLOSED_DEG : 0;
    Serial.println(F("OK"));
  } else if (cmd.startsWith("S ")) {
    float v = cmd.substring(2).toFloat();
    if (v >= 1 && v <= 360) {
      speedDegPerS = v;
      Serial.println(F("OK"));
    } else {
      Serial.println(F("ERR ARGS"));
    }
  } else if (cmd.startsWith("J ")) {
    float v[JOINTS];
    int pos = 2;
    for (uint8_t i = 0; i < JOINTS; i++) {
      int next = cmd.indexOf(' ', pos);
      String token = (next < 0) ? cmd.substring(pos) : cmd.substring(pos, next);
      token.trim();
      if (token.length() == 0) { Serial.println(F("ERR ARGS")); return; }
      v[i] = token.toFloat();
      pos = (next < 0) ? cmd.length() : next + 1;
    }
    for (uint8_t i = 0; i < JOINTS; i++) {
      if (v[i] < LIMIT_MIN[i] || v[i] > LIMIT_MAX[i]) { Serial.println(F("ERR RANGE")); return; }
    }
    for (uint8_t i = 0; i < JOINTS; i++) target[i] = v[i];
    Serial.println(F("OK"));
  } else {
    Serial.println(F("ERR CMD"));
  }
}

void setup() {
  Serial.begin(115200);
  pcaInit();
  for (uint8_t i = 0; i < JOINTS; i++) writeJoint(i);
  lastUpdateMs = millis();
  Serial.println(F("READY"));
}

void loop() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n') {
      handle(line);
      line = "";
    } else if (c != '\r' && line.length() < 80) {
      line += c;
    }
  }
  unsigned long now = millis();
  if (now - lastUpdateMs >= 20) {  // 50 Hz 제어 루프
    advance((now - lastUpdateMs) / 1000.0);
    lastUpdateMs = now;
  }
}
