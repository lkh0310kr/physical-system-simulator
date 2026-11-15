# 중간 목표 — Arduino 로봇팔 (물체를 인식하고, 위치를 지정하고, 집어서 옮기는 4~5축 팔)

사용자 제안(2026-11-16). 가지고 있는 Arduino 키트를 최대한 재활용하고, 나중에 카메라·AI Agent를 붙인다. 이 시나리오를 PhysiSim으로 **설계 → 시뮬레이션 → 제작**까지 끌고 가는 것이 목표다.

## 1. 목표

- Arduino 기반 4축(+그리퍼) 로봇팔: 물체를 집어 지정 위치로 옮긴다
- PC(AI Agent)에서 USB Serial로 동작 명령을 보내고 상태를 읽는다
- 부품을 모듈 단위로 교체·확장할 수 있는 구조
- 시뮬레이션에서 먼저 검증하고(관절 한계·도달 범위·전류·들어 올릴 무게), 실제 부품 구매·조립으로 이어진다

## 2. 기구

| 축 | 역할 | 구동부 |
|---|---|---|
| J1 | 베이스 회전 | 서보(SG90/MG90S급) |
| J2 | 어깨 상하 | 고토크 서보(MG996R) |
| J3 | 팔꿈치 상하 | 고토크 서보(MG996R) |
| J4 | 손목 각도 | 서보(SG90급) — 처음에는 생략해 4축으로 시작 가능 |
| J5 | 물체 잡기 | 그리퍼 서보 |

## 3. 전자·제어 구성

```text
PC / AI Agent ─ USB Serial ─ Arduino Uno ─ I2C ─ PCA9685 ─ PWM ─ J1..J5 서보
외부 5~6 V 전원 ─ 서보 드라이버·서보  (GND는 Arduino와 공통, 서보를 Arduino 5 V 핀으로 구동하지 않는다)
```

## 4. 소프트웨어 구조

`RobotArm`(Joint: Base·Shoulder·Elbow·Wrist·Gripper) · `MotionController`(MoveTo·Pick·Place) · `HardwareController`(ServoDriver). 좌표 → 관절 각도 변환(역기구학)은 PC 또는 별도 제어 로직에서 한다. 명령 예: `{"action":"pick_and_place","target":{x,y,z},"destination":{x,y,z}}`.

## 5. 개발 순서 (사용자 제안)

1. 단일 관절 제어 → 2. 다관절 조립·수동 자세 → 3. 좌표 제어(IK) → 4. PC 연동(Serial) → 5. AI Agent 연동

## 6. PhysiSim 시뮬레이션 매핑

| 실물 | PhysiSim | 상태 |
|---|---|---|
| 서보 MG996R / SG90급 | `model.servo-mg996r`, `model.servo-sg92r` (속도·토크·크기는 제품 값) | MG996R 추가(아래 확인 값), SG92R 있음 |
| 프레임·관절 | `model.arm-frame` (5 관절을 3D에서 움직이는 체인) | 완료 (`examples/robot-arm.system.json`) |
| 역기구학 | `model.arm-ik` (목표 XYZ → 관절 각도, 도달 불가 표시) | 완료 |
| 집기·옮기기 | `model.pick-place-sequencer` + `model.cube-object` (그리퍼가 닫히면 물체가 따라옴, 단순 부착) | 완료 (`examples/robot-arm-pick-place.system.json`) |
| PCA9685 | I2C 버스 시뮬레이션 없이 신호 블록으로 추상화 | 후속 결정 |
| Arduino Uno 펌웨어 | Serial 명령 → 서보. avr8js에 I2C(TWI) 연결이 필요 | 후속 결정 |
| PC/Agent | 파일 기반 Agent(스펙 §10.1) + `physisim` CLI, 이후 Serial 프로토콜 | 후속 |
| 카메라·물체 인식 | 시나리오(웨어러블 카메라) 카메라 모델 재사용 | 후속 |

## 7. 확인한 부품 값 (2026-11-16)

| 부품 | 값 | 출처 |
|---|---|---|
| MG996R | 정지 토크 9.4 kgf·cm(4.8 V)·11(6 V), 속도 0.17 s/60°(4.8 V)·0.14(6 V), 55 g, 40.7×19.7×42.9 mm | Tower Pro 데이터시트 사본 (`courses.ece.cornell.edu` 보관본) 및 유통사 다수. 일부 판매처는 4.8 V 속도를 0.19 s/60°로 적어 **출처 간 불일치** |
| SG92R(Adafruit 169) | 0.1 s/60°, 2.5 kg·cm, 23×11×29 mm, 9 g | Adafruit 제품 페이지 |
| PCA9685(Adafruit 815) | 16채널 12비트, 서보 분해능 약 4 µs(60 Hz), 5 V 호환 | 판매처 설명(Adafruit 페이지 전문은 확인 못 함) — 기본 I2C 주소는 미확인 |

## 8. 결정이 필요한 것

- 가지고 있는 키트의 서보 종류·수량 (사진 필요)
- 팔 길이와 들어 올릴 무게 (MG996R 토크와 프레임 강도에 맞춰 결정; 지금은 링크 100 mm 두 개 가정)
- I2C(PCA9685)·Arduino 펌웨어를 시뮬레이션에 넣을지(avr8js TWI) 아니면 신호 블록으로 둘지
- 그리퍼 파지를 접촉 물리(Rapier)로 할지, 지금처럼 "닫히면 따라옴"으로 단순화할지
