# ADR-0002: 강체 물리는 Rapier(WASM)를 엔진 안 어댑터 뒤에 둔다

- 상태: 확정
- 날짜: 2026-11-16
- 결정자: 사용자 ("도입", 선택지 중 Rapier 도입 승인)
- 관련 스펙: §9.1, §12 (v0.13 물리 엔진 결정, v0.17)
- 관련 Task: P7-T7, P7-T10

## 배경

기계 Net(축 속도 공유)과 평면 차체 적분만으로는 로봇이 벽을 통과한다. 충돌·접촉을 계산하는 강체 물리가 필요하다.

## 선택지

| 안 | 장점 | 단점 | 참고 사례 |
|---|---|---|---|
| A. Rapier (`@dimforge/rapier3d-compat`, Apache-2.0, WASM) | 결정론적, 브라우저·Node 모두 동작, 3D 충돌·관절 확장 가능 | WASM 초기화가 비동기, 번들 15 MB(압축 전) | Rapier는 three.js 생태계에서 흔함 |
| B. 직접 구현(평면 AABB 충돌) | 의존성 없음 | 관절·3D·회전 충돌을 다시 만들어야 함 | — |
| C. MuJoCo(WASM) | 로봇 접촉 모델이 정교 | 용량·API 무거움, 지금 필요 이상 | MuJoCo/URDF |

## 결정

A. 이번 범위는 **평면(바닥 위) 이동**이다: 몸체는 z 고정·z축 회전만, 정적 상자 장애물과 충돌, 중력 없음.
- 어댑터: `packages/engine/src/physics.ts` (`initPhysics`, `createPlanarWorld`). 시뮬레이션은 `options.assembly`가 있고 초기화가 끝났을 때만 물리를 쓴다 — 아니면 Behavior가 직접 적분(기존 동작).
- Behavior는 `drive`(이동 명령)와 `onPose`(물리 자세 수신)를 내놓는다. 장애물은 Model `body.collision: "static"`.
- 호출자는 한 번 `await initPhysics()` 한다 (CLI·웹 워커의 모듈 최상위).

## 결과

- 로봇이 벽에 막힌다. 바퀴는 막혀도 계속 도는 것(견인·미끄러짐 모델 없음)이 한계다.
- 관절·스프링·3D 중력·접촉 마찰은 후속(P7-T8 힌지·슬라이더).
- 결정론: 같은 입력이면 같은 결과를 테스트로 고정했다.
