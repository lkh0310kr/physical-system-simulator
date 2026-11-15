# 시스템 작성 가이드 (AI 에이전트·사용자용)

PhysiSim 회로·시스템은 **파일**로 만든다. 자연어 요청을 받은 코딩 에이전트(Codex CLI, Claude Code 등)는 아래 파일을 수정하고, `physisim watch`가 변경을 감지해 다시 실행한다.
형식의 기준은 `schemas/*.schema.json`과 `physisim models` 출력이다. 이 문서는 흐름과 규칙만 다룬다.

## 1. 작업 흐름

```bash
pnpm physisim models [검색어]                 # 1. 쓸 부품·핀·속성 찾기 (--json 가능)
#                                              # 2. system.json / program.js 작성·수정
pnpm physisim validate my.system.json         # 3. 검증 — 오류는 위치와 함께 나온다
pnpm physisim run my.system.json --duration 2s   # 4. 실행 — 바뀐 값의 시간표 (--json 가능)
pnpm physisim watch my.system.json            #    또는 저장할 때마다 자동 실행
```

## 2. System 파일 (`*.system.json`)

```json
{
  "$schema": "../schemas/system.schema.json",
  "name": "Blink LED",
  "instances": [
    { "id": "uno", "model": "model.arduino-uno", "program": "blink.ino" },
    { "id": "r1", "model": "model.resistor", "properties": { "resistance": "220Ω" } },
    { "id": "led1", "model": "model.led" }
  ],
  "connections": [
    ["uno:D13", "r1:1"],
    ["r1:2", "led1:A"],
    ["led1:C", "uno:GND.1"]
  ]
}
```

- `instances[].id`: 소문자로 시작하는 이름. 연결에서 `id:Port`로 쓴다.
- `properties`: Model 값을 덮어쓴다. 숫자는 그 속성의 단위 기준, 또는 `"220Ω"`, `"4.7kΩ"`, `"3.3V"`, `"20mA"` 같은 물리량 문자열.
- `connections`: 두 Port를 잇는 선. 같은 Port에 여러 선을 이으면 한 노드가 된다. Port 이름은 `physisim models`의 `ports`.
- 회로가 닫히려면 **GND**(`(GND)` 표시 Port)로 돌아와야 한다.
- `layout`: 에디터용 화면 정보. 시뮬레이션에는 영향 없음.

## 3. MCU 프로그램 — Arduino 스케치 (`*.ino`)

실제 보드에 올리는 Arduino 코드를 그대로 쓴다. arduino-cli로 컴파일한 펌웨어를 avr8js가 명령어 단위로 실행하므로 실제 UNO와 같이 동작한다.

```cpp
void setup() {
  pinMode(13, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  digitalWrite(13, HIGH);
  Serial.println("on");
  delay(500);
  digitalWrite(13, LOW);
  Serial.println("off");
  delay(500);
}
```

- 필요: `arduino-cli`와 AVR 코어 (`brew install arduino-cli && arduino-cli core install arduino:avr`). 없으면 오류 메시지가 설치법을 알려 준다.
- 핀 번호 n은 Port `D<n>`이다 (Arduino UNO: 0~13). `Serial` 출력은 실행 결과와 에디터의 코드 패널에 나온다.
- 컴파일 오류는 `blink.ino:10:3: 'digitalWrit' was not declared in this scope`처럼 줄 위치와 함께 나온다.
- 지금은 스케치 파일 하나(.ino)만 지원한다. 외부 라이브러리 설치는 아직 지원하지 않는다.
- 가벼운 실험용으로 JS 스크립트(`*.js`, `function* loop() { …; yield delay(500); }`)도 쓸 수 있다.

## 4. 새 부품 (로컬 Model)

표준 라이브러리에 없는 부품은 System 옆에 Model JSON을 만들고 `library`에 적는다.

```json
{ "library": ["models/bright-led.json"], "instances": [{ "id": "led1", "model": "model.bright-led" }] }
```

```json
{
  "$schema": "../../schemas/model.schema.json",
  "id": "model.bright-led",
  "name": "Bright LED",
  "category": "electronics/output",
  "propertySchema": {
    "forwardVoltage": { "type": "number", "unit": "V" },
    "maxCurrent": { "type": "number", "unit": "mA" },
    "dynamicResistance": { "type": "number", "unit": "Ω" }
  },
  "properties": { "forwardVoltage": 2, "maxCurrent": 10, "dynamicResistance": 10 },
  "ports": [{ "name": "A", "domain": "electrical" }, { "name": "C", "domain": "electrical" }],
  "capabilities": [{ "capability": "capability.light-emission" }]
}
```

- 동작은 기존 Capability·Behavior를 조합해서만 만든다. 새 Behavior 코드는 아직 지원하지 않는다.
- Capability가 요구하는 속성(예: LED Behavior는 `forwardVoltage`, `maxCurrent`, `dynamicResistance`)은 표준 Model을 `physisim models --json`으로 보고 맞춘다.

## 5. 오류 읽기

```
✗ my.system.json
- connections[2][1]: model.led에 없는 Port: K
- model.bright-led:capabilities[0].capability: 등록되지 않은 Capability: capability.nope
```

- 앞부분은 위치다: `connections[2][1]`은 세 번째 연결의 두 번째 Port, `model.x:...`는 그 Model 파일 안의 위치.
- 오류를 모두 고친 뒤 `validate`가 `✓`를 내면 실행할 수 있다.

## 6. 부품 값의 출처

부품 Model의 값(전류, 전압, 시간 등)은 실제 제품 데이터시트에서 가져온다. 확인한 값은 `metadata.source`에 문서·표 번호를 적고, 확인하지 못한 값은 가정이라고 설명(description)에 쓴다. 예: `docs/scenarios/wearable-camera-specs.md`.

## 제작 가능한 케이스 (기구)

Model에 `body`(박스 크기, mm)와 `mounts`를 쓰고, System의 `assembly`에 배치(mm, 회전 도)를 쓰면 케이스를 만들 수 있다.

- 케이스에 구멍이 필요한 곳은 mount에 `opening`을 붙인다: `{"shape":"round","diameter":5.3}` 또는 `{"shape":"rect","width":12.4,"height":6.5}`. mount의 `normal`은 x·y·z 축 방향이어야 하고, `position`은 부품이 통과하는 점(부품 끝면)이다.
- 구매 부품은 Model `metadata.bom`에 `{vendor, name, mpn, url}`을 쓴다. 없으면 BOM에서 "모델링 전용"으로 빠진다.
- `pnpm physisim case <system.json>` — 검증을 통과하면 `out/`에 베이스·뚜껑 STL, 3MF, BOM CSV를 쓴다. 검증 실패 시 이유를 보여 주고 파일을 쓰지 않는다. 웹 3D 화면의 `케이스`(단면, 다운로드)로도 볼 수 있다.
- 공정 규칙(벽 두께, 틈새, 최소 구멍, 브리지 한계, 출력 크기)은 프로필: `--process fdm`(기본) 또는 `--profile my.json`(기본값에 덮어쓸 항목만).
- 예제: `examples/camera-case-xiao-s3-sense.system.json`.
- 3D 화면에서 더 실물처럼 보이게 하려면 Model `body.parts`에 세부 형상(box/cylinder, `material`은 pcb·metal·plastic·glass·rubber)을 mm로 적는다. 표시 전용이고 케이스 계산은 `body.size` 박스를 쓰므로, 모든 세부 형상은 박스 안에 들어가야 한다. 예: `xiao-esp32s3-sense.json`.
- 제작사 CAD가 있으면 `tools/step-to-glb.py`로 glb를 만들어 `apps/web/public/meshes/`에 두고 Model `body.mesh`에 파일 이름을 쓴다. 메시를 못 읽으면 `parts`, 그것도 없으면 박스로 대신 그린다. 메시는 `body.size` 박스 안에 들어와야 한다(테스트가 확인).
- Port가 닿는 물리 지점은 Model `body.pins`(`port`, `position` mm, 보드에 적힌 `label`)로 적는다. 연결(connections)의 두 끝이 모두 pins를 가지면 3D에서 케이블로 보인다. XIAO 보드는 위키 핀맵 그림과 STEP 뒷면 패드 위치가 일치하는 BAT± 패드를 쓴다.
- `body.mesh`가 있으면 `case`가 박스뿐 아니라 실제 형상으로도 케이스 간섭을 검사한다 (`--meshes <폴더>`, 기본 `apps/web/public/meshes`). 파일을 못 읽으면 경고하고 박스로만 검사한다.

## 파라미터 스윕 (에이전트용)

값을 바꿔 가며 같은 시뮬레이션을 반복해 비교한다: `pnpm physisim sweep <system.json> --set r1.resistance=100,220,1000 --watch led1.brightness,r1.current --duration 2s`. `--set`은 여러 번 쓰면 모든 조합을 돈다. 표는 신호별 최종·최대 값을 보여 준다(LED가 탔는지는 `led1.burnt`를 watch).

## 자동 탐색 (에이전트용)

제약을 지키면서 목표가 가장 좋아지는 값을 찾는다: `pnpm physisim tune <system.json> --range r1.resistance=50..2000 --maximize led1.brightness --require led1.burnt=false --require "r1.current<=0.02"`. 거친 격자 후 가장 좋은 점 주변을 다시 훑고, 제안과 평가한 값(제약 ○/×)을 보여 준다. 제약 만족 값이 없으면 종료 코드 1. 제안은 파일을 고치지 않는다 — 에이전트가 값을 확인하고 직접 반영한다.

## 새 부품 검증·승인 (에이전트용)

에이전트가 부품(Model/Capability)을 쓰면 먼저 `pnpm physisim check <파일.json>`으로 스키마·교차 참조를 검증한다. 통과해도 "사람이 확인할 것"(출처 없음, 미확인 가정 수, 치수 없음)이 함께 나오고, 이 명령은 파일을 고치지 않는다. 사람이 값과 출처를 확인한 뒤 System의 `library`에 추가하는 것이 승인이다.

## 기구 동작 (플런저)

`capability.switching`에 `travel`(mm)을 주면 누름이 즉시가 아니라 플런저 이동으로 접점을 움직인다(`operatingTravel`에서 닫히고 80% 지점에서 열림, `pressTime`에 걸쳐 이동). 출력 `plunger`(0~1)를 세부 형상의 `motion`(`{signal:"plunger", axis:"z", distance:-1}`)에 연결하면 3D에서 플런저가 눌린다. 예: `model.tactile-12mm`, `examples/tactile-led.system.json`.

## 기계 연결과 움직임 (모터·바퀴)

- Port의 `domain`이 `mechanical`이면 회전축이다. 두 축을 `connections`로 이으면 같은 각속도를 공유하는 하나의 기계 Net이 된다(강체 결합). 예: `["ml:shaft", "car:left"]`.
- 모터 Model(`model.tt-motor`)은 전기 단자 A·B와 축 `shaft`를 가진다: 전압 → 전류 → 토크, 역기전력이 속도를 제한한다. 차체(`model.robot-chassis-2wd`)는 `left`·`right` 축의 속도로 `x`·`y`·`heading`·`speed`를 출력한다(오른쪽 모터 극성을 뒤집으면 제자리 회전).
- 3D에서 움직이게 하려면 System `assembly`에서 차체에 붙는 부품(모터·배터리)에 `"parent": "car"`를 쓴다. 차체의 `x/y/heading` 신호로 함께 움직이고, 카메라가 따라간다. 예: `examples/robot-drive.system.json`.
