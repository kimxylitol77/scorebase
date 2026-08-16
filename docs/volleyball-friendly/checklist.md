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
