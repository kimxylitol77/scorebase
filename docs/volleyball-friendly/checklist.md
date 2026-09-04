# 배구 국가대표 친선 (남·여) 온보딩 체크리스트

목표. 플래시스코어에 뜨는 배구 국제친선(ts utid 남 `z8yomoxhk3gm0j6` / 여 `56ypq3xh533qd7o`)을 /scores 배구 탭에 수집·노출.

- [x] sport-leagues.ts — ALL_LEAGUES 에 `VB_FRIENDLY`, `VB_FRIENDLY_W`
- [x] sport-leagues.ts — SPORTS.volleyball.leagues 에 추가 (VOLLEYBALL_LEAGUES 는 여기서 파생 — poller·odds·route 자동 커버)
- [x] sport-leagues.ts — LEAGUE_LABELS 표시명
- [x] sport-leagues.ts — 정렬 priority (EGL_W 25.2 뒤)
- [x] team-names.ts — RAW_BY_LEAGUE.VB_FRIENDLY_W (여자 국대 "X Women"→"X" 표기, 위민 접미 방지)
- [x] DB — Netherlands(남) Team 신규 + TeamSourceId, 기존 5팀에 친선 리그 TeamSourceId 추가
- [x] 매핑 JSON 두 사본 — 친선 리그 row 6건 (src 사본은 lightsail 과 동기화도 겸함)
- [x] volleyball-collector.js — UTID_TO_LEAGUE 2건
- [x] tsc 통과 → commit(37422df) → main push (7a03cdc — origin/main V-리그 팀 14건과 union 병합)
- [x] Vultr — collector.js + mapping JSON scp → chown → node --check → systemctl restart
- [x] 검증 — 워커 첫 poll upserted=14 skippedNoTeam=0, prod 매치 14건 (오늘 3 + 지난주 11 — 미시드 팀도 JSON unambiguous 경로로 해석됨)
- [x] 검증 — Vercel 배포 후 /scores 배구 탭 노출 확인 (오늘 카드 1건 + 리그 칩, 한글 팀명·로고 정상, 상세 페이지 200)
- [x] 후속 — 친선 매치 상세의 "순위표 →" 링크 숨김 (친선은 standings 없음 → 소프트 404 방지)

## 2차 — 대륙·연령별 선수권 7개 (2026-08-16, 1fed080 + 042e529)

- [x] 리그 코드 7 — VB_U17_WC(남/여)·VB_EURO_W·VB_ASIAN_W·VB_NORCECA_W·VB_PANAM·VB_COPA_AM
- [x] 대회명 7m 대조 확정 (짐작 금지 — 날짜별 화면 대조로 7개 전부 확인)
- [x] 팀 110 시드 (신규 67 / 기존 43 재사용) + 매핑 JSON 두 사본 204건
- [x] team-names 전역 국가명 6 + 리그별 사전 110
- [x] collector UTID_TO_LEAGUE 7 → Vultr 배포·재시작 (수집 107건)
- [x] backfill=16 일회 실행 — 과거분 포함 251건 upsert
- [x] standings-poller VOLLEYBALL_SEASONS 7 등록 → 캐시 7/7 (ok 143→150)
- [x] 검증 — DB 223건, 한국 대표팀 11건, /scores 배구 1→19경기, 순위표 조별 렌더

## 3차 — 아시아선수권 (남) VB_ASIAN (2026-09-04, 4ff8e05)

발단: 베트맨 배당 탭에 뜬 한국-대만(9/4 16:00 "아시아 남자배구 선수권대회")이 /scores 에 없었다. ts utid `8y39mpwh5wlqojx` 가 수집기 매핑에 없어 조용히 skip 되던 것.

- [x] 대회 확정 — 이번엔 ts `unique_tournament/list` 가 인가돼 있어 이름("Asian Championship")을 직접 받았고, 베트맨 라벨·참가팀(12개국·4개조·9/4~9/9 18경기)과 일치
- [x] 리그 코드 VB_ASIAN — ALL_LEAGUES·SPORTS.volleyball·LEAGUE_DISPLAY "아시아선수권 (남)"·priority 25.215
- [x] team-names VB_ASIAN 12개국
- [x] 팀 — 중국·일본·이란은 VNL row 재사용(TeamSourceId 만 추가), 9개국 신규 / 매핑 JSON 두 사본 204→216
- [x] collector UTID_TO_LEAGUE + standings-poller VOLLEYBALL_SEASONS(season 2y8m4wh84xzql07, table/detail code=0·4테이블)
- [x] Vultr 배포·재시작 → 첫 poll upserted=30 skippedNoTeam=0 · DB VB_ASIAN 18경기(한국-대만 LIVE 1-1) · /scores 배구 탭 "아시아선수권 (남)" 카드+순위 칩 노출 확인

## 4차 — 8월 보류분 3개 (2026-09-04, 8a7f4b5)

- [x] 이름 확정 — ts `unique_tournament/list` 인가로 직접 조회(7m 대조 불필요): Central American & Caribbean Games Women(4년 주기, 8/5~7 종료 10경기) · SEA V League Women(8/7~9, 6경기) · Premier Volleyball League(필리핀 여자 클럽, 8/8~ 주 1~2회 진행 중)
- [x] 리그 코드 VB_CAC_GAMES_W·VB_SEA_V_W·PVL_W + 표시명·정렬·한글 팀명 22
- [x] 팀 22 (국대 10 재사용·클럽 등 12 신규) → 매핑 JSON 두 사본 216→238
- [x] collector UTID 3 · standings-poller 시즌 3 (CAC 2테이블, SEA V·PVL 실측 0 → 빈 payload skip)
- [x] Vultr 배포·재시작 + backfill=30 → upserted=411 · DB PVL_W 21(진행 14 종료)·CAC 10·SEA V 6 (2026-09-04)
