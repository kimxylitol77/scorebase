# 인계 노트 — 2026-08-06 (worktree: handover-rank-mapping-fc1e04)

## 방금 끝낸 것 — 전술판 야구·농구 확장 (3407b55, 배포·프로덕션 확인 완료)

/lineup?sport=basketball|baseball. 상세는 docs/lineup-multisport/checklist.md 와
메모리 lineup-teambuilder 갱신분. 핵심 규칙: wire sp 필드(코드=진실)·POS_CODES append-only.

## 직전 작업들 (전부 배포됨)

- MLB 연봉 소속팀 공백 fix (895d962) — 153→20명, 상위 400 내 0
- TacticalPad 조사 → 다종목 확장 실행. **애니메이션(프레임 재생)은 다음 후보로 남음** —
  무료 경쟁자(tactical-board.com)도 가진 기능, 사용자 아직 미결정
- 게시판 경기 카드 첨부(7329b34) — 회원 화면 사용자 확인 대기

## 열려 있는 것

- 감독 수집·번역 주기 실행 미배선(수동 1회 상태) — 주 1회 맥미니 잡 후보
- 전술판 애니메이션 — 사용자 확정 시 프레임 시퀀스 방식(반나절~하루)
