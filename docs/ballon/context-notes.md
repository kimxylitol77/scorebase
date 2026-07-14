# 발롱도르 지수 계산기 — 컨텍스트 노트

## 배경 (2026-07-14)
사용자 요청: 인터랙티브 실시간 발롱도르 지수. 골+도움·리그계수·평점·팀성적 반영,
웹 검색으로 후보 보정, 월드컵 성적 실시간 반영. 오늘 WC 2026 준결승(결승 7/19).

## 데이터 실사 결과
- LeagueLeader: 24 클럽리그 + WORLD_CUP 의 GOAL/ASSIST TOP10, season 2025-26 / WC=2026.
  후보 풀 414명, externalId(af player id) 100% 보유.
- PlayerMatchLog: 3300명 시즌 경기로그(rating/goals/assists), playerId=ts id. WC 커버 0.
- WORLD_CUP LeagueLeader 40건(골·도움 리더 존재), 매치 102/FINISHED 100. WC 평점 없음.
- getFullStandings(league) → StandingsRow[]{teamId(=our id), position, points}. 팀성적 소스.

## 웹 검색 담론 (2026 발롱도르, 2026-07 시점)
케인(선두, WC 준결승 6골)·음바페(프랑스 우승시 유력)·야말·뎀벨레(2025 수상)·홀란드·메시(WC 골든볼).
이번 시즌 공격수 중심 → 골·도움 리더보드로 대부분 커버, 수비수/GK 누락 우려 작음.

## 핵심 설계 결정
- 병합 키 = 원본 af player id. loadLeagueLeaderboard 는 externalId 를 ts 로 변환해버려 부적합
  → prisma.leagueLeader 직접 조회. 최신 시즌만(season desc 첫 값).
- 점수(클라 실시간): score = baseGoal×gMul + baseAssist×aMul + ratingPts×rMul + teamPts×tMul
  + (wcGoal×gMul + wcAssist×aMul)×wcMul.  각 term 은 서버 사전계산, 슬라이더는 배율(0~2, 기본 1).
  wcMul=0 이면 월드컵 제외(별도 토글 대신 슬라이더 0).
- 리그계수: 빅5=1.0, UCL=1.2, WC=1.3, UEL=0.8/UECL=0.65, 포르투갈/네덜란드/멕시코/MLS/사우디=0.6~0.7, 2부=0.5.
- ratingPts=(avg-6.5)×8 clamp≥0. teamPts=rankPct×10 (rankPct=(n-pos+1)/n).
- 한계 명시: 스탯 기반 근사, 우승·정성 임팩트 미반영 → "scorebase 지수" 브랜딩.

## 재사용 (Explore 조사)
- toKoreanPlayerName (player-names.ts:1992), toKoreanTeamName (team-names.ts:3358, league 인자)
- afPlayerToTs (players/ts-af-map.ts:30)
- getFullStandings (thesports/standings-helper.ts:189)
- LEAGUE_DISPLAY, getLeagueFlag (sport-leagues.ts), leagueLogoUrl (league-logos.ts:19)
- 페이지 컨벤션: 서버 page.tsx(metadata + async prisma) → 'use client' props 전달
  (예: app/predictions/title-race/page.tsx).
