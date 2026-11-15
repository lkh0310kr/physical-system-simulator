# Wearable Camera Node — 부품 사양 (실제 제품 확인)

원칙: 모델 값은 실제 제품 데이터시트에서 가져온다. **확인** = 원문에서 직접 읽음, **유도** = 확인한 값으로 계산, **미확인** = 출처 없음(가정). 값을 바꿀 때는 이 표와 모델 `metadata.source`를 함께 갱신한다. 조사일 2026-11-15.

## 확인한 값

| 부품 | 항목 | 값 | 출처 |
|---|---|---|---|
| ESP32-S3 | Wi-Fi TX (802.11n HT20 MCS7 @18.5 dBm) | 283 mA 피크, 3.3 V, 듀티 100% | ESP32-S3 Datasheet v2.2 Table 5-7 |
| | Wi-Fi TX (802.11b 1 Mbps @21 dBm / 11g 54 Mbps @19 dBm) | 340 / 291 mA | 같은 표 |
| | Wi-Fi RX (802.11b/g/n HT20) | 88 mA | 같은 표 |
| | 240 MHz 듀얼코어 모뎀슬립(주변장치 클럭 끔/켬) | 66.2 / 81.3 mA (32-bit 접근), 91.7 / 107.9 mA (128-bit) | Table 5-9 |
| | 딥슬립 (RTC 메모리·주변장치 켬 / RTC 메모리만) | 8 / 7 µA | Table 5-10 |
| | 라이트슬립 · PSRAM 추가(8MB 8-line 3.3 V) | 240 µA · +140 µA | Table 5-10 주석 |
| | Wi-Fi 처리량 (TCP TX, 실험실 공중) / 차폐 상자 | 20 / 83 Mbit/s | ESP-IDF Wi-Fi Performance 문서, iperf |
| ESP32-S3-WROOM-1 모듈 | 딥슬립 실측 / 활성 평균 | 8.14 µA / 약 23.88 mA (3.3 V 추정, 20초 간격 깨움) | ESP-IDF Current Consumption Measurement 문서 |
| OV2640 | 전원 | 코어 1.2 V ±5%, 아날로그 2.5~3.0 V, I/O 1.7~3.3 V | OV2640 Datasheet (OmniVision) |
| | 활성 전력 UXGA 15 fps | YUV 125 mW, 압축(JPEG) 140 mW | 같은 문서 |
| | 스탠바이 | 600 µA | 같은 문서 |
| OV5640 | 전원 | 코어 1.5 V, 아날로그 2.6~3.0 V(2.8 typ), I/O 1.8/2.8 V | OV5640 Datasheet Table 8-3 |
| | 활성 2592×1944 @15 fps JPEG | 아날로그 30 mA + 디지털 110 mA (typ), 최대 40 + 140 mA | Table 8-3 |
| | 활성 1080p @30 fps JPEG | 30 + 100 mA (typ) | Table 8-3 |
| | 스탠바이 | 20 µA (하드웨어 PWDN) | 키 스펙 |
| | 전원 인가 → PWDN 해제 | AVDD 안정 후 ≥ 5 ms, 이후 RESETB까지 ≥ 1 ms | §2.7 power up sequence |
| ESP32-C6 | Wi-Fi TX (802.11n HT20 MCS7 @18.5 dBm / 802.11ax MCS9 @16.5) | 280 / 252 mA | ESP32-C6 Datasheet v1.6 Table 5-7 |
| | Wi-Fi RX | 78 mA | 같은 표 |
| | 딥슬립 / 라이트슬립 | 7 / 180 µA | Table 5-11 |
| ESP32-P4 | 기능 | JPEG 코덱, ISP, MIPI CSI, H.264 인코더, PPA, QFN104 10×10 mm. **Wi-Fi 없음** | ESP32-P4 Datasheet v0.7 |
| | 활성 (240 아님: 400 MHz 듀얼코어 / 200 MHz) | 69–112 mA / 44–87 mA (while(1)) | Table 5-7 |
| | 딥슬립 / 라이트슬립 / 전원 끔 | 12 µA / 85 µA(USB) / 1 µA | Table 5-8 |
| nRF9160 | LTE-M 업링크 / NB-IoT 업링크 | 375 / 60 kbps | nRF9160 Product Brief v2.1 |
| | PSM 바닥 전류 | 2.7 µA (LTE-M, NB-IoT) | 같은 문서 |
| | 공급 전압 / 크기 | 3.0–5.5 V / 10×16×1.04 mm | 같은 문서 |
| Quectel BG95 시리즈 | 업링크 최대 Cat M1 / Cat NB2 | 1119 / 158.5 kbps | Quectel Product Brochure V8.6, LPWA modules 표 |
| | PSM 전류 (BG95 시리즈 / BG95xA-GL) | 3.9 µA / 1.5 µA | 같은 표 (BG96은 10 µA) |
| | 공급 전압 (BG95xA-GL) | 2.2–4.35 V, typ 3.3 V (다른 변종은 Hardware Design 참조) | 같은 표 |
| | 최대 출력 / 크기 | 23 dBm (Power class 3) / 23.6×19.9×2.2 mm LGA | 같은 표 |
| | BG95-M3 전류 (3.8 V 공급, 상온) — LTE Cat M1 데이터 전송 | B1 @21.29 dBm 193.65 mA · B3 @20.67 dBm 185.89 mA · B8 @21.02 dBm 197.31 mA · B13 @20.99 dBm 198.75 mA (대역별 약 185–199 mA) | BG95 Series Hardware Design V1.8, Table 43 |
| | PSM / 누설(전원 끔) / Rock Bottom (AT+CFUN=0) | 3.89 µA / 12.99 µA / 0.575 mA | 같은 표 |
| | 슬립 DRX 1.28 s (Cat M1 / NB1) · 유휴 DRX 1.28 s (Cat M1) | 1.89 / 1.49 mA · 18.9 mA | 같은 표 |
| | 유휴 e-I-DRX 81.92 s (Cat M1, PTW 2.56 s) | 18.2 mA 유휴 / 0.63 mA 슬립 | 같은 표 |
| Quectel EC200U (Cat 1 bis) | 업링크 최대 | 5 Mbps (LTE-FDD) | Brochure Cat 1 bis 표 |
| | 전력 | 전원 꺼짐 30 µA, LTE 슬립 1.35 mA (PF=256), 유휴 13 mA | 같은 표 |
| | 크기 | 28.0×31.0×2.4 mm | 같은 표 |
| Adafruit 1317 LiPo | 용량 / 전압 / 크기 | 150 mAh, 3.7 V 공칭, 만충 4.2 V, 종지 3.0 V, 19.75×26.02×3.8 mm | adafruit.com/product/1317 |
| TI TPS62840 | 무부하 Iq / 효율 | 60 nA / 1 µA 출력에서 80% | datasheet SLVSEC6D §7.5, §1 |
| TI BQ25185 | 배터리 전용 누설 / 충전 전류 | 4 µA / 5 mA–1 A | datasheet SLUSF65B §5.5 |

## 유도한 값 (모델에 사용)

- OV2640 압축 활성 전류 ≈ 140 mW / 3.3 V ≈ **42 mA** (레일 전압이 여러 개라 3.3 V 환산은 근사).
- OV5640 JPEG 5MP 활성 ≈ 30 + 110 = **140 mA** (센서 레일 합, 3.3 V 환산 근사).
- Case A 촬영 중 노드 전류 = ESP32-S3 240 MHz 듀얼코어 66 mA + 센서.

## 미확인 (가정으로 남아 있음 — 실측 또는 추가 조사 필요)

| 항목 | 현재 모델 가정 | 비고 |
|---|---|---|
| 촬영 시간 (센서 시작 + 노출 수렴 + JPEG) | 250 ms | OV5640 최소 시퀀스는 확인(≥ 6 ms)했지만 자동노출 수렴 프레임 수는 미확인 |
| 부팅 시간 | 150 ms | 미확인 |
| Wi-Fi 연결 시간 (고정 IP) | 600 ms | Espressif 문서에서 값 못 찾음 |
| Wi-Fi 연결 중 전류 | 88 mA (RX 확인값, 하한) | TX 구간이 섞이므로 실제는 더 높음 |
| JPEG 파일 크기 | UXGA 90 kB 가정 | 센서 문서에 없음, 장면·압축 설정 의존 |
| 실효 업로드 속도 | 2.5 MB/s (실험실 TCP TX 20 Mbit/s) | 실제 HTTP 업로드는 더 느림 |
| 센서 전원 차단 | 로드 스위치로 완전 차단 가정 | OV2640 스탠바이 600 µA는 켜 두면 절전 전류가 수십 배 |
| 셀룰러 연결(attach) 시간 | **없음** | BG95 Hardware Design에도 시간은 없음 (Network/eDRX/PSM Application Note 필요) |
| EC200U(Cat 1 bis) TX 전류 | **없음** | Hardware Design이 다운로드 존 검색에 없음 |
| nRF9160 TX 전류 | **없음** | Product Brief에 TX 표 없음 |
| ESP32-P4 촬영+인코딩 전류, 카메라 SoC 가격 | **없음** | P4 데이터시트에는 CPU 활성 전류만 있음 |
| 배터리 내부 저항·최대 방전율 | 0.15 Ω 가정 | Adafruit 1317 페이지에 없음 (셀 PDF 미조회) |
| Himax WiseEye2 HX6538, Alif E1 | — | 요약 페이지만 확인 (Alif E1: STOP 1.7 µA, ISP/JPEG 없음) |
