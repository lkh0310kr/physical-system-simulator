# Handoff — Robot Arm (Phase 8) · 2026-11-16

다음 에이전트/사람이 바로 이어받기 위한 상태 메모. 방향·결정은 `docs/scenarios/robot-arm.md`, `docs/PHASE_PLAN.md`(중간 목표 — Robot Arm)가 기준이다.

## 현재 위치
- 브랜치 `phase/8-robot-arm`, PR #18 (아직 **푸시 안 된 커밋 있음**: `git push`로 올린다). 관련 PR #17(Rapier)은 사용자가 병합한다.
- 검증: `pnpm lint`(경고 4, 기존) · `pnpm typecheck` · `pnpm test`(411개) 통과, 브라우저(3D)에서 `robot-arm` 예제 동작 확인.

## 이번 구간에서 한 일
- 출력용 팔 부품 생성·검증(`packages/cad/src/arm-parts.ts`, `physisim arm parts`): STL/3MF/BOM/glb.
- `body.parts`에 `mesh` 형상(glb 파일 + motion 사슬) 추가 → 3D 팔이 출력용 부품으로 그려지고 관절별로 움직임.
- 실물 3D 모델 적용: MG996R·SG92R(GitHub 제3자 STEP), Uno(Adafruit Metro 328 대용). 출처는 `docs/references.md`.
- 변환 도구: `tools/step-to-glb.py` (cadquery 필요, 임시 venv에서 실행. 저장소 의존성 아님).

## 남은 일 (우선순위 순)
1. **문서 갱신**: `docs/scenarios/robot-arm.md`(선정 부품 BOM·추천 치수·프로토콜·출력 부품·가정), `PHASE_PLAN.md`(A6/A7/A8/A10 체크 — A10은 부품·BOM·3D 반영됨), `docs/AUTHORING.md`(`mesh` 형상), PR #18 설명.
2. **팔 안의 서보를 실물 메시로**: `model.arm-frame`의 어깨·팔꿈치·손목 서보가 아직 상자. `mesh` 부품에 위치·회전 지정을 추가해야 함(현재 glb 원점 고정).
3. 사용자가 말한 "웹에서 부품별 3D 모델 다운로드"가 뷰어의 부품별 glb/STL 내려받기를 뜻하는지 **확인 필요**(지금은 웹에서 모델을 찾아 받는 쪽으로 해석).
4. PCA9685 glb(`pca9685-adafruit-815.glb`)는 변환만 됨 — Model 연결은 결정 필요(현재 I2C/PCA9685는 신호 블록으로 추상화).
5. 보류: 그리퍼 접촉 물리(Rapier, 사용자 "4번 보류"), avr8js TWI로 실제 `.ino` 실행, A9 카메라·AI Agent.

## 주의할 점 / 가정
- 서보 출력축 위치·혼 나사 구멍·고정 방식은 **제품 자료로 확인 못 한 가정** — 출력 전 실물 측정 필요(`arm parts`가 목록 출력).
- 서보 glb에는 혼이 고정 포함 → 서보 단독 혼 회전 표시는 없음.
- 서보 두 모델은 제3자 STEP, 라이선스 미확인(사용자가 "라이선스 상관없음"으로 허락).
- Uno 메시는 Metro 328 대용(외곽 규격 동일, 커넥터 다를 수 있음).
- 결정 이력·ADR 변경은 없었음(스펙 §12 추가 기록 불필요). 커밋은 Task별로, 푸시는 사용자 요청 시에만(AGENTS.md §3).
- `.serena/` 디렉터리는 추적되지 않는 로컬 파일 — 커밋하지 않는다.
