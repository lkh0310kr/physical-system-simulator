# PhysiSim 프로젝트 전체 설계 명세 (Specification)

> **현재 설계 기준:** v0.5 (2026-11-15)  
> **프로젝트 유형:** Model-driven Physical Systems Simulator  
> **개발 방향:** AI Agentic Simulation Platform  
> **핵심 철학:** Model 중심 설계

## 1. 프로젝트 개요

### 1.1 프로젝트 정의

**PhysiSim**은 다양한 물리적 대상을 Model로 정의하고, 이를 조합하여 실제 물리 시스템을 구성하고 시뮬레이션하는 플랫폼이다.

AI Agent가 Model을 탐색하고, 시스템을 구성하며, 시뮬레이션을 실행하고 결과를 분석할 수 있도록 하는 것을 목표로 한다.

**프로젝트 설명**

> AI 에이전트 기반 모델 중심 물리 시스템 구성 및 시뮬레이션 플랫폼

### 1.2 지원 대상 분야

| 분야 | 주요 대상 |
|---|---|
| Electronics | MCU, LED, Sensor, Motor |
| Electrical | Circuit, Wire, Resistor, Voltage |
| Mechanical | Body, Joint, Gear, Wheel |
| Physical | Motion, Force, Collision, Gravity |
| Control | Controller, PID, PLC |

단순한 로봇 시뮬레이터가 아니라 다양한 물리 시스템을 다루는 범용 플랫폼을 지향한다.

## 2. 핵심 설계 철학

PhysiSim은 Model 중심으로 설계한다.

| 원칙 | 설명 |
|---|---|
| Model-driven | 모든 시스템 구성의 중심은 Model |
| Model / Instance Separation | 정의와 실제 실행 객체를 분리 |
| Model / Behavior Separation | 모델 데이터와 실행 로직을 분리 |
| Extensible | 새로운 모델과 기능을 쉽게 추가 |
| Composable | 여러 모델을 조합해 복합 시스템 구성 |
| Agentic | AI Agent가 모델 탐색, 구성, 실행, 분석 |

### 2.1 핵심 개념 구분

- **Model — Definition:** 무엇인가? 어떤 속성과 기능을 가지는가?
- **Behavior — Runtime Logic:** 어떻게 동작하는가? 입력에 따라 어떤 상태 변화가 발생하는가?
- **Instance — Runtime Object:** 실제 시뮬레이션에서 생성된 객체와 현재 상태는 무엇인가?

Model은 데이터 정의이며 Behavior는 별도 실행 로직이다. Instance는 Model을 참조하여 시뮬레이션에서 동작한다.

## 3. 전체 시스템 아키텍처

현재 구상하는 논리적 아키텍처는 다음과 같다.

```text
PhysiSim
│
├── Model System
│   ├── Identity
│   ├── Properties
│   ├── Components
│   ├── Capabilities
│   └── Metadata
│
├── Behavior System
│   └── Runtime Logic
│
├── Instance System
│   └── State
│
├── Composition System
│   └── Model Relationships
│
├── Simulation Engine
│   ├── Time Management
│   ├── Event Management
│   ├── State Management
│   └── Domain Solvers
│
├── Agent System
│   ├── Model Discovery
│   ├── System Composition
│   ├── Simulation Execution
│   └── Result Analysis
│
└── Visualization / Editor
    ├── Model Editor
    ├── System Editor
    └── Simulation Viewer
```

이는 현재의 논리적 구성안이며 실제 패키지나 모듈 경계는 추후 결정한다.

## 4. Model System

### 4.1 Model의 정의

Model은 물리적 대상 또는 시스템을 표현하는 재사용 가능한 정의 데이터다.

제품, 부품, 기능을 갖는 장치, 복합 시스템 등을 모두 Model로 표현하는 것을 목표로 한다.

### 4.2 Model 구조

**확정: 하이브리드 방식(C)**

Model은 다음 영역으로 구성한다.

```text
Model
│
├── Identity
│   └── 모델 식별 정보
│
├── Properties
│   └── 정적 속성
│
├── Components
│   └── 내부 구성 요소
│
├── Capabilities
│   └── 제공 기능
│
└── Metadata
    └── 부가 정보
```

#### Identity

Model을 식별하는 정보.

예:
- ID
- Name
- Category

#### Properties

Model이 가지는 정적인 속성.

예:
- Voltage
- Current
- Clock Speed
- Weight
- Length

#### Components

다른 Model을 내부 구성 요소로 참조한다.

예:

```text
Arduino UNO
├── ATmega328P
├── USB Interface
└── Power Circuit
```

이를 통해 Model을 재사용하고 복합 시스템을 표현한다.

#### Capabilities

Model이 제공하는 기능.

예:
- GPIO
- ADC
- PWM
- UART
- SPI
- I2C

#### Metadata

제조사, 데이터 출처, 모델 버전 등 부가 정보.

### 4.3 Properties 구조

**확정: Schema 기반(C)**

속성 정의와 실제 속성값을 분리한다.

**Property Schema**

속성의 이름, 타입, 단위, 제약 조건을 정의한다.

```ts
interface PropertyDefinition {
    type: string;
    unit?: string;
    min?: number;
    max?: number;
}
```

**실제 Property Values**

```ts
const arduinoUnoProperties = {
    voltage: 5,
    clockSpeed: 16
};
```

위 예시는 개념을 보여주는 초안이다. 실제 Schema와 값의 연결 및 검증 규칙은 아직 미정이다.

이 방식의 목적:
- 속성 정의 재사용
- 데이터 검증
- 물리 단위 관리
- AI Agent가 생성한 모델의 유효성 검사

## 5. Capability System

**확정: 독립적인 Capability 정의(B)**

### 5.1 Capability의 정의

Capability는 Model이 제공하는 기능을 추상적으로 정의한 것이다.

Capability를 단순 문자열로 관리하지 않고 독립적인 정의 객체로 관리한다.

예를 들어 GPIO라는 Capability는 여러 MCU와 보드에서 공통적으로 사용할 수 있다.

### 5.2 개념적 구조

```text
Capability
│
├── Identity
│   ├── id
│   └── name
│
├── Inputs
│
├── Outputs
│
└── Parameters
```

예를 들어 GPIO는 다음과 같이 표현할 수 있다.

```text
GPIO Capability
│
├── Inputs
│   └── Pin Configuration
│
├── Outputs
│   ├── Digital Read
│   └── Digital Write
│
└── Parameters
    └── Pin Number
```

### 5.3 Model과 Capability의 관계

```text
Arduino UNO Model
├── GPIO Capability
├── ADC Capability
├── PWM Capability
└── UART Capability

STM32 Model
├── GPIO Capability
├── ADC Capability
├── PWM Capability
└── UART Capability
```

여러 Model이 같은 Capability 정의를 참조할 수 있다.

실제 지원 핀 수, 전압, 채널 수 등의 차이는 Model별 설정으로 표현하는 방향을 검토한다.

### 5.4 Capability 인터페이스 초안

```ts
interface Capability {
    id: string;
    name: string;

    inputs: Record<string, unknown>;
    outputs: Record<string, unknown>;
}
```

아직 최종 인터페이스는 아니다.

Capability는 실행 로직을 직접 포함하지 않는다. 실행은 Behavior가 담당하며, 연결 방식은 §14에서 확정했다(A' 하이브리드).

## 6. Behavior System

**확정: Model과 분리**

Behavior는 Model과 별도로 존재하는 실행 로직이다.

Model은 무엇인지 정의하고, Behavior는 어떻게 동작하는지 정의한다.

예를 들어 LED의 경우:

```text
LED Model
├── Properties
│   ├── Forward Voltage
│   └── Current
│
└── Capabilities
    └── Light Emission

LED Behavior
├── Input: Voltage
├── Input: Current
└── Runtime Logic
    └── Brightness Calculation
```

Behavior는 향후 다음과 같은 기능을 담당할 수 있다.

- 입력 처리
- 출력 생성
- 상태 변화
- 시간에 따른 동작
- 물리적 반응

Behavior의 인터페이스와 실행 모델은 미결정이다.

## 7. Instance System

Instance는 특정 Model을 기반으로 실제 시뮬레이션에서 생성되는 객체다.

예를 들어 LED Model 하나를 이용하여 여러 LED Instance를 만들 수 있다.

```text
LED Model
│
├── LED Instance #1
│   ├── State: ON
│   └── Brightness: 100%
│
├── LED Instance #2
│   ├── State: OFF
│   └── Brightness: 0%
│
└── LED Instance #3
    ├── State: ON
    └── Brightness: 50%
```

개념적인 인터페이스:

```ts
interface ModelInstance {
    id: string;
    modelId: string;
    state: Record<string, unknown>;
}
```

현재 State 구조와 Runtime Context는 미결정이다.

## 8. Model Composition

Composition은 여러 Model을 조합하여 더 큰 시스템을 만드는 개념이다.

예:

```text
Robot Model
│
├── Arduino UNO Model
├── Motor Model
├── Wheel Model
├── Sensor Model
└── Chassis Model
```

다양한 물리적 시스템을 구성할 수 있도록 설계한다.

단순히 Model 목록을 포함하는 것뿐 아니라, 연결 관계와 구성 방식도 추후 정의해야 한다.

## 9. Simulation Engine

Simulation Engine은 실제 시뮬레이션 실행을 담당한다.

현재 구상하는 주요 역할은 다음과 같다.

| 기능 | 설명 |
|---|---|
| Time Management | 시뮬레이션 시간 관리 |
| Event Management | 이벤트 처리 |
| State Management | Instance 상태 관리 |
| Behavior Execution | Behavior 실행 |
| Domain Solvers | 전기·기계·물리 계산 |

### 9.1 통합 시뮬레이션 예시

```text
MCU
  │ GPIO Signal
  ▼
Motor Driver / Circuit
  │ Electrical Power
  ▼
Motor
  │ Rotation
  ▼
Wheel
  │ Mechanical Motion
  ▼
Robot Body
  │
  ▼
Sensor
  │ Measurement
  ▼
MCU
```

전자·전기·기계·물리 영역이 연결되는 시뮬레이션을 목표로 한다.

## 10. AI Agent System

AI Agent는 PhysiSim을 사용하는 지능형 구성 및 실행 주체다.

예상 역할:

1. 자연어로 사용자의 요구사항 이해
2. 적합한 Model 검색
3. Model 및 Capability 조합
4. 시스템 구성
5. 시뮬레이션 실행
6. 결과 분석 및 개선안 제시

예를 들어 사용자가 다음과 같이 요청할 수 있다.

> Arduino UNO로 LED를 제어하는 회로를 구성하고 시뮬레이션해 줘.

AI Agent는 필요한 Model을 검색하고 Instance를 생성하며 연결 관계를 구성하고 시뮬레이션을 실행하는 방향을 목표로 한다.

## 11. 기술적 방향 및 초기 개발 원칙

현재 TypeScript 기반 설계를 출발점으로 삼는다.

중요한 설계 고려 사항:

- TypeScript Interface는 런타임에 사라지므로 동적 Model 정의에는 JSON 데이터와 런타임 Schema 검증이 필요하다.
- Model은 데이터 중심으로 관리한다.
- Behavior는 별도 실행 구현체로 관리한다.
- 물리량은 단위와 함께 관리한다.
- 처음부터 모든 물리 영역을 구현하지 않는다.
- CPU 명령어 단위 에뮬레이션보다는 단순한 Behavior부터 시작한다.

초기 개발은 간단한 LED와 GPIO 시뮬레이션부터 시작하는 것이 적절하다.

## 12. 설계 결정 이력

| 항목 | 선택 | 상태 |
|---|---|---|
| 프로젝트 방향 | Model-driven | 확정 |
| Behavior 설계 | Model과 분리 | 확정 |
| Model 구조 | 하이브리드(C) | 확정 |
| Properties | Schema 기반(C) | 확정 |
| Capability | 독립 정의(B) | 확정 |
| Behavior ↔ Capability 연결 | A' 하이브리드 (기본 참조 + Model override) | 확정 (v0.5) |
| 개발 전략 | Headless 코어 우선 | 확정 (v0.5) |
| 런타임 Schema 검증 | Zod v4 | 확정 (v0.5) |
| 저장소 / 툴체인 | pnpm 모노레포 | 확정 (v0.5) |
| Instance 구조 | 미결정 | 대기 |
| Behavior 인터페이스 | 미결정 | 대기 |
| Composition 구조 | 미결정 | 대기 |
| Simulation Engine | 미결정 | 대기 |
| AI Agent 연동 | 미결정 | 대기 |

## 13. 앞으로 결정할 순서

1. **Model 구조** — 확정: 하이브리드 구조
2. **Properties 타입 시스템** — 확정: Schema 기반
3. **Capability 정의 및 확장** — 확정: 독립적인 Capability 정의
4. **Behavior ↔ Capability 연결** — 확정: A' 하이브리드
5. **Behavior 인터페이스 (시그니처·실행 모델)** — 다음 결정 (Phase 1)
6. **Instance와 State**
7. **Model Composition (Port / Connection)**
8. **Simulation Engine**
9. **AI Agent Integration**

## 14. Behavior와 Capability의 관계

**확정 (v0.5): A' 하이브리드 — Capability가 기본 Behavior를 참조하고, Model이 이를 override할 수 있다.**

검토했던 대안:

| 안 | 내용 | 결과 |
|---|---|---|
| A | Capability가 Behavior를 직접 참조 | 기반으로 채택 |
| B | Model이 Capability와 Behavior를 각각 참조 | override 요소만 채택 |
| C | 별도 Registry에서 연결 | 미채택 (간접 계층 과다) |

### 14.1 구조

```text
GPIO Capability
└── defaultBehavior → DigitalIOBehavior

Arduino UNO Model
└── Capabilities
    └── GPIO
        ├── config: { pinCount: 20, logicLevel: 5V }   ← Model별 설정
        └── behavior: (생략 → Capability 기본값 사용)

ESP32 Model
└── Capabilities
    └── GPIO
        ├── config: { pinCount: 34, logicLevel: 3.3V }
        └── behavior → Esp32DigitalIOBehavior          ← override
```

### 14.2 Behavior 해석 규칙

1. Model의 Capability 바인딩에 `behavior`가 있으면 그것을 사용한다.
2. 없으면 Capability 정의의 `defaultBehavior`를 사용한다.
3. 둘 다 없으면 Model 검증 단계에서 오류로 처리한다.

### 14.3 개념 인터페이스 (초안)

```ts
interface BehaviorRef {
    id: string;          // 예: "behavior.digital-io"
    version?: string;
}

interface CapabilityDefinition {
    id: string;
    name: string;
    inputs: Record<string, unknown>;
    outputs: Record<string, unknown>;
    parameters: Record<string, unknown>;
    defaultBehavior?: BehaviorRef;
}

interface ModelCapabilityBinding {
    capability: string;               // CapabilityDefinition.id
    config?: Record<string, unknown>; // Model별 설정 (핀 수, 전압 등)
    behavior?: BehaviorRef;           // override
}
```

### 14.4 남은 하위 결정 (Phase 1에서 결정)

- 하나의 Capability 바인딩이 여러 Behavior를 동시에 가질 수 있는가
- Behavior 실행 시그니처 (순수 함수 `step(state, inputs, dt)` vs 객체/이벤트 핸들러)
- Behavior 버전 관리 방식

## 15. 기술 스택 및 개발 전략 (v0.5)

| 항목 | 결정 | 비고 |
|---|---|---|
| 언어 | TypeScript (strict, ESM) | §11 |
| 런타임 Schema | Zod v4 | `z.toJSONSchema()`로 Agent tool schema 생성 |
| 저장소 | pnpm workspaces 모노레포 | packages/*, apps/* |
| 테스트 | Vitest | |
| Lint / Format | Biome | |
| 개발 전략 | Headless 코어 우선 | 코어(테스트·CLI) → Agent → 2D 에디터 → 3D·물리 |

세부 일정은 `docs/PHASE_PLAN.md`를 따른다.

## 16. 변경 이력

| 버전 | 날짜 | 변경 내용 |
|---|---|---|
| v0.4 | — | 초기 기준선 (Model 구조, Properties, Capability 확정) |
| v0.5 | 2026-11-15 | §14 Behavior↔Capability A' 하이브리드 확정, §15 기술 스택·개발 전략 추가, §12·§13 갱신, 문서 주도 개발 원칙(문서는 목표·구조, 세부는 코드) |

---

## 문서 관리 원칙

- 문서 버전은 설계 결정이 추가되거나 변경될 때 갱신한다.
- 확정된 결정과 미결정 사항을 구분한다.
- 기존 결정을 변경하면 변경 이유와 영향을 기록한다.
- 사용자가 **"스펙"**이라고 요청하면 이 문서를 기준으로 프로젝트 전체 명세를 갱신하여 제공한다.
- 이 문서는 현재까지 합의한 설계 기준이며, 코드 인터페이스 예시는 일부 개념 검증용 초안이다.
- 이 문서는 **핵심 목표·설계 철학·시스템 구조·확정된 결정**만 다룬다. 필드·시그니처·세부 규칙은 코드(스키마·타입·테스트)가 기준이며, 이 문서의 코드 예시는 개념 스케치다.
- 구조나 결정이 바뀔 때만 이 문서를 갱신한다.
