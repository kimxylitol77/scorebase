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
- [ ] tsc 통과 → commit → main push (Vercel)
- [ ] Vultr — collector.js + mapping JSON scp → chown → node --check → systemctl restart
- [ ] 검증 — 워커 로그 upserted 확인 + prod 매치 생성 확인 (네덜란드-벨기에 8/17 00:00 KST 등 3건)
