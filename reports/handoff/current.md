# 인계 노트 — 2026-08-05 (worktree: handover-rank-mapping-fc1e04)

## 방금 끝난 것 — 게시판 경기 데이터 카드 첨부 (커밋 7329b34, push·배포 완료)

작성 폼: 픽 없이 경기만 골라도 카드 첨부 가능(게이트 predReady→selected, cardMatchId 독립 전송).
수정 화면: MatchCardField 신설 — 기존 카드 감지·미리보기·유지/제거/변경. 본문 반영은
actions.ts 의 applyMatchCard(MATCH_CARD_RE 단일 포맷)가 담당. 경기 로더는
lib/analysis/match-options.ts 로 추출해 작성·수정 공유.

- E2E 로컬 통과: 픽 없이 작성(pick null + 카드 삽입) → 수정에서 제거 → 본문 정리. 테스트 글 삭제함.
- 프로덕션: /analysis/new 200 (비회원 게이트 렌더). **회원 화면은 prod 세션 못 만들어 미확인** —
  사용자 직접 확인 필요(작성 폼에서 경기만 골랐을 때 "경기 데이터 카드 첨부" 체크박스,
  기존 글 수정에서 "경기 데이터 카드 (선택)" 섹션).
- eslint 경고 1건(AnalysisForm useEffect 미사용)은 기존 죽은 import — 건드리지 않음.

## 이 세션에서 그 전에 끝난 것 (전부 배포됨)

- 라인업: 교체·카드·득점·벤치(990eb55) → 확대 개편(897ecf2) → 감독 수집·표시(05b9432)
  → fotmob 격차 4종: 감독사진·⚽·어시스트·선수링크(839ef45) → 감독 한글화 93%(4bd154b)
- 크로스소스 중복: 팀매핑 리그인식(a7bb163) · 탐지창 72h(6263998) · 입구차단(bb62424+방향가드)
  · 정리잡 보강(e76464c) — data-sanity 0건 유지 중
- AIHL·NZIHL 하키 온보딩(0d83193) · /picks/strong 화면 개편(cb1845d) · 쇼츠 8시 내구성 3종

## 열려 있는 것

- 감독 수집(collect-all-team-coaches)·번역(translate-coach-names) 주기 실행 미배선 — 수동 1회 상태.
  감독 교체 시 낡아짐. 주 1회 맥미니 잡 후보.
- 다른 세션 병행 주의: 이 기간 data-sanity·cleanup 잡을 다른 세션도 고쳤다(2357f75·501a36b).
  같은 영역 작업 전 git log 먼저 볼 것.
