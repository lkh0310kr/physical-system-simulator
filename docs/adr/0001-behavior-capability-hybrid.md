# ADR-0001: Behavior ↔ Capability 연결 — A' 하이브리드

- 상태: 확정
- 날짜: 2026-11-15
- 결정자: 사용자
- 관련 스펙: §14

## 배경

Capability는 기능의 정의, Behavior는 실행 로직이다(스펙 §5, §6). 둘의 연결 방식이 Phase 1 코어 인터페이스를 결정한다.
스펙 v0.4는 A(직접 참조)를 추천했지만 "Model마다 실행 구현을 교체할 수 있는가"가 미해결이었다.

## 선택지

| 안 | 장점 | 단점 | 참고 사례 |
|---|---|---|---|
| A 직접 참조 | 관계가 명확, 단순 | Model별 구현 교체 불가 | — |
| A' 기본 참조 + Model override | 단순함 유지 + 교체 가능 | 해석 규칙 1단계 추가 | Modelica `replaceable` |
| B Model이 각각 참조 | Model별 자유도 최대 | 모든 Model에 Behavior 중복 기재 | — |
| C Registry 연결 | 가장 유연 | 간접 계층, 추적 어려움 | — |

## 결정

**A'.** Capability 정의가 `defaultBehavior`를 가지며, Model의 Capability 바인딩이 `behavior`로 override할 수 있다.
해석 순서: 바인딩 override → Capability 기본값 → 없으면 검증 오류.

## 영향

- `CapabilityDefinition.defaultBehavior`, `ModelCapabilityBinding.behavior` 필드 도입 (스펙 §14.3)
- Behavior Registry(BehaviorRef → 구현체)는 여전히 필요하지만, Capability→Behavior 매핑 자체는 Registry가 아닌 데이터에 있다.
- 하위 결정(다중 Behavior, 실행 시그니처, 버전 관리)은 Phase 1에서 사용자 결정.
