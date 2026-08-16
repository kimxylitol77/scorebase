# 아이스하키 클럽 친선 온보딩 체크리스트

목표. TheSports ice_hockey utid `j1l4rj1bv30r7vx`(클럽 친선)를 `/scores` 하키 탭에 수집·노출.

실측 근거 (2026-08-16, ts diary 7/18~8/31 45일 sweep).
- 친선 매치 320건 · 고유 팀 **249개** (전부 남자 클럽, 국대 0)
- 팀 롱테일 심함 — 249팀 중 82팀이 1경기뿐. 부분 매핑은 양팀 동시 필요라 제곱으로 손실
  (상위 100팀만 매핑하면 매치 커버 51%). → **249팀 전량 시드**가 유일하게 합리적
- 친선 창은 8/31 종료. 9월부터는 유럽 정규시즌 — 팀 시드가 그대로 재사용된다 (context-notes 참조)

- [x] types.ts — League union 에 `HOCKEY_FRIENDLY`
- [x] sport-leagues.ts — ALL_LEAGUES
- [x] sport-leagues.ts — SPORTS.hockey.leagues
- [x] sport-leagues.ts — LEAGUE_LABELS 표시명
- [x] sport-leagues.ts — 정렬 priority (NZIHL 22.6 다음)
- [x] sport-leagues.ts — LEAGUE_COUNTRY
- [x] sports/index.ts — collectors no-op + teamSourceFor → "thesports"
- [x] predictionEngine.ts — HOCKEY_LEAGUES 집합
- [x] analysis/matches.ts — 리그 라벨
- [x] hockey/page.tsx — HOCKEY 배열
- [x] DB — Team 249건 + TeamSourceId(league=HOCKEY_FRIENDLY, source=thesports) 신규 생성
- [x] 매핑 JSON 두 사본 — `src/lib/sports/thesports/` · `lightsail-worker/` 에 249행 추가
- [x] ice-hockey-match-collector.js — COMP_TO_LEAGUE 에 utid 1건
- [ ] tsc 통과 → commit → main push
- [ ] Vultr — collector.js + mapping JSON scp → chown → node --check → systemctl restart
- [ ] 검증 — 워커 poll 로그 `63 → 312 mapped teams`, upserted > 0, skippedNoTeam=0
- [ ] 검증 — Vercel 배포 후 /scores 하키 탭 카드 노출 + 상세 200

## 안 한 것 (의도)

- **팀 한글명 249건** — 유럽 클럽 음차는 오역 위험이 커 자동 생성 금지(메모리 `player-name-wiki-unify` 유형).
  이번엔 영문 노출, 한글화는 별건.
- **순위표** — 하키는 ts `season/table` 미인가 + 친선은 애초에 순위 없음.
- **카자흐스탄컵(`8yomodb7o17q0j6`) · 벨라루시안컵(`p4jwq2lblzyr0ve`)** — 사용자가 "덤"으로 언급했을 뿐
  요청 범위 밖. 각각 10팀·14팀으로 작고, 팀 상당수가 친선 249에 이미 포함되니 나중에 utid 1줄로 붙는다.
