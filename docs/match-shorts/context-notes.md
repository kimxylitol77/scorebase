# 컨텍스트 노트 — match-shorts

- 09-11 탐색 결과(Explore 에이전트 + 실측): RECAP cron 은 73a88ad(05-23)에서 제거됨. CLAUDE.md 의 "07:00 RECAP" 표기는 stale.
- TheStatsAPI 경로: `/football/competitions/{comp}/seasons`(is_current), `/football/matches?competition_id&season_id&date_from&date_to`, `/football/matches/{id}` (`xg_available`, `live`), `/football/matches/{id}/shotmap`. 26/27 시즌 id: LaLiga sn_8407970, Bundesliga sn_0835912 (나머지는 seasons 로 조회).
- 429 대응은 build-match-shotmaps.ts 의 api() 재시도 패턴 재사용.
- 샷 좌표계: x 0~105(공격 방향 기준 골라인까지 거리로 보임, 9=근거리), y 0~68. SoccerShotMap.tsx 의 shotX() 변환 로직을 그대로 옮긴다.
- 맥미니 node 는 /opt/homebrew/bin/node (plist 는 /usr/local/bin/node 심링크 사용).
- 유튜브 토큰은 MacBook .env.local 에만 있음 → 맥미니 .env 에 사용자가 복사해야 함(내가 읽지 않는다).
