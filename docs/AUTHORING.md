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
    { "id": "uno", "model": "model.arduino-uno", "program": "blink.js" },
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

## 3. MCU 프로그램 (`*.js`)

```js
function setup() {
  pinMode(13, OUTPUT);
}

function* loop() {
  digitalWrite(13, HIGH);
  yield delay(500);        // delay는 반드시 yield와 함께
  digitalWrite(13, LOW);
  yield delay(500);
}
```

- API: `pinMode(pin, INPUT|OUTPUT)`, `digitalWrite(pin, HIGH|LOW)`, `digitalRead(pin)`, `delay(ms)`, `millis()`, `micros()`, `Serial.begin(baud)`, `Serial.print(x)`, `Serial.println(x)`.
- 핀 번호 n은 Port `D<n>`이다 (Arduino UNO: 0~13).
- `delay` 없는 `loop`는 1ms마다 다시 호출된다.
- 오류가 나면 프로그램만 멈추고 결과에 `프로그램 오류`로 표시된다.

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
