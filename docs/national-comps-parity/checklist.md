# 국가 대항전 전체 → 네이션스리그 급 — 체크리스트 (2026-09-25)

목표. 네이션스리그에 붙인 승·무·패 AI 예측, 핸디·오버언더·양팀득점 마켓, 3버튼 투표, 노출 목록을
지금 열리는 국가 대항전 전체(A매치 친선·아프리카 네이션스컵·걸프컵·U-21 유로 예선·아시안게임 남녀)와
앞으로 열릴 국대 대회(월드컵 예선·유로 예선·골드컵·연령별 대회)에 똑같이 붙인다.

## A. 전력(Elo) — 연령별·여자까지
- [x] sport-leagues `NATIONAL_SOCCER_COMPS`(성인+연령별+여자) · `YOUTH_NATIONAL_LEAGUES` · `WOMEN_NATIONAL_LEAGUES` · `usesNationalElo`
- [x] fifa-rankings `getFifaRankWomen`
- [x] national-elo `nationalEloFor(league, name, tableElo)` — 성인=시드, 연령별=성인 전력 축소+대회 성적, 여자=여자 FIFA 환산+대회 성적
- [x] 적용 4곳: MatchInsight · SoccerTeamStrength · predictionEngine · build-context
- [x] 표본 게이트 면제 2곳: compute-prediction · evaluate-predictions
- [x] predictionEngine DISPLAY_ONLY 에서 아시안게임 축구 남녀 제거

## B. 승·무·패
- [x] predictionEngine FOOTBALL_LEAGUES_DRAW · MatchVoteCard(ko·en) · picks DRAW_LEAGUES

## C. 마켓
- [x] SOCCER_LEAGUES_FOR_MARKETS + SPORT_PROFILE (대회별 실측)

## D. 노출
- [x] PREVIEW_LEAGUES: 걸프컵·아시안게임 남녀 (아프리카컵·U-21 예선은 처리량 때문에 제외)
- [x] picks 대상·라벨, build-context SOCCER_LEAGUES (live-scores 라벨은 LEAGUE_DISPLAY 폴백으로 이미 나옴)
- 보류: accuracy 집계·페이지 — 채점 완료가 친선 8건뿐이라 빈 행만 늘어난다. 표본 쌓이면 편입

## 검증
- [x] 단위: 대회별 예정 경기 compute-prediction 산출률·시장 대조
- [x] tsc · npm test
- [x] 배포 후 실렌더(아시안게임·걸프컵·U-21 경기 상세)

## 검증 결과 (2026-09-25, 향후 7일 예정 경기 dry-run)
| 대회 | 예정 | 승무패 | OU·핸디 |
|---|---|---|---|
| 친선 | 31 | 31 | 24 |
| 아프리카컵 | 39 | 39 | 29 |
| 걸프컵 | 8 | 8 | 8 |
| U-21 예선 | 42 | 42 | 42 |
| 아시안게임 남 | 4 | 4 | 4 |
| 아시안게임 여 | 4 | 4 | 4 |
| 네이션스리그(회귀 확인) | 52 | 52 | 48 |
- OU·핸디 빠진 경기 = A매치 이력이 거의 없는 팀(탄자니아·기니비사우 등).
- 한계: 걸프컵 예멘-카타르 예멘 56% — 카타르는 eloratings 시드(1425), 예멘은 FIFA 환산(1510)이라 척도가 섞였다. 시장 배당이 들어오면 블렌드로 보정.
- tsc 통과 · npm test 405/405
