# `/odds` 배당 페이지 — 컨텍스트 노트

착수 중 결정과 근거. 계속 덧붙임.

## 왜 이 페이지인가 (2026-07-10)
- 발단: 사용자가 oddsportal.com 같은 "배당 몰아보는 라이브스코어"를 원함.
- oddsportal 정수 = 여러 북메이커 배당 **비교**. 우리는 평균만 저장 → 목록 비교는 불가, 상세 비교는 이미 됨(`MatchOddsTable`). 그래서 "배당 중심 목록 + 상세에서 업체 비교" 형태로 타협.

## 데이터 현실 (조사 결과, 반드시 숙지)
- Match 배당 필드 2계층:
  - 컨센서스(vig 제거): `marketHome/Draw/Away`, `marketBookmakers`(수만), `openingMarket*`, `valueGap`
  - Raw decimal(표시용): `oddsHome/Draw/Away`, `oddsTotalLine/Over/Under`, `oddsHcLine/HcHome/HcAway`, `oddsBtts*`, `oddsDc*`
- **개별 북메이커 배당은 DB 에 없음.** 상세 페이지에서 `live-odds` 의 `bookmakerList` 로 실시간 fetch 만.
- 시계열: `OddsSnapshot`(분당 h2h 평균), `TsBaseballOddsHistory`(야구, Lightsail worker 60s).

## 재사용 지도
- 목록 데이터: `/api/live/scores` + `fetchAllLiveScores`(`src/lib/sports/live-scores.ts`)
- 축구 인라인 배당 참고: `src/components/scores/soccer/SoccerLiveRow.tsx` (`OddsCell` 503~, `OddsPopup` 540~)
- `/scores` 의 `MatchOdds` 매핑: `src/app/scores/page.tsx` 1431~, select 615~623
- 상세 업체 비교표: `src/components/MatchOddsTable.tsx` (api-football FixtureOdds)
- 상세 통합 카드: `src/components/live/LiveOddsCard.tsx` (bookmakerList + sparkline)
- 폴링: `src/components/scores/LiveRefresher.tsx`
- 상수: `src/lib/sports/sport-leagues.ts` (SPORTS, SOCCER_LEAGUES, LEAGUE_DISPLAY 232, LEAGUE_ORDER 423)
- 배당 리그 커버리지: `src/lib/odds/odds-api.ts` `SPORT_KEY` (2026-07-10 축구 56개로 확장됨)

## 열린 질문
1. 목록의 라이브(in-play) 배당 최신성 — cron/스냅샷 기준이라 실시간 아님. 목록에서도 갱신할지, 상세에서만 최신으로 둘지.
2. 예정 경기 배당 없는 리그(친선 등)는 배당칸 공백 처리 — 빈칸 vs "배당없음" 표기.
3. 진입점 위치 — 헤더 메뉴 / `/scores` 상단 링크 중 어디.

## 주의 (기존 함정)
- `/scores` 는 SoccerLiveRow 컬럼 바뀌면 globals.css nth-child 셀렉터 깨짐(스코어보드.kr sb-mode). `/odds` 는 별도 컴포넌트라 무관하지만, SoccerLiveRow 를 직접 수정하지 말고 **새 OddsRow 로 복제**할 것.
- 배당 표시 숫자는 DB 값 그대로 — 하드코딩·마케팅 수치 금지(site number consistency 원칙).
