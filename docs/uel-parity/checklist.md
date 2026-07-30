# UEL → UCL 급 승격 체크리스트 (2026-07-30)

목표. 유로파리그(UEL)를 챔피언스리그(UCL)와 같은 등급으로 취급 — 예측 시장·글 자동발행·적중률 노출·사용자 기능 화이트리스트에 편입.

## A. 예측 엔진
- [x] `lib/predict/markets.ts` SOCCER_LEAGUES_FOR_MARKETS + UEL → BTTS/DC·Skellam 분포·연장 정규화(evaluate 의 GRADING_REGTIME_LEAGUES 가 이 세트를 spread)
- [x] `lib/predict/build-context.ts` SOCCER_LEAGUES + UEL → topScores 컨텍스트

## B. 글 자동발행
- [x] `lib/sports/types.ts` PREVIEW_LEAGUES + UEL (7·8월 예선은 isUefaQualifierMatch 가 계속 스킵 — UCL 과 동일 동작)
- [x] `jobs/generate-analysis.ts` leagues + UEL
- [x] `jobs/generate-tactical.ts` TARGET_LEAGUES + UEL

## C. 적중률 노출
- [x] `lib/predict/accuracy-stats.ts` ACCURACY_LEAGUES + ACCURACY_SOCCER
- [x] `app/predictions/accuracy/page.tsx` LEAGUES + LEAGUE_NAME
- [x] `components/HeroSection.tsx` ACCURACY_LEAGUES (뱃지 표본 = 페이지 표본 일치 유지)

## D. 데이터 수집
- [x] `jobs/fetch-gpt-predictions.ts` MAJOR_LEAGUES + UEL
- [x] `app/api/cron/backfill-corners/route.ts` MAJOR + UEL
- [x] `lib/live/soccer-live-stats.ts` european + UEL — **버그 fix**. UEL 이 빠져 1~6월 녹아웃 시즌이 year 로 오산됐다.

## E. 사용자 노출
- [x] `app/picks/page.tsx` PICK_LEAGUES·DRAW_LEAGUES·LEAGUE_KO + `app/picks/me/page.tsx` LEAGUE_KO
- [x] `components/Footer.tsx` 유로파리그 링크
- [x] `lib/sports/live-scores.ts` LEAGUE_LABEL 짧은 라벨
- [x] `components/LeagueLeaderBoard.tsx` PLAYER_PAGE_LEAGUES (players/[pid] 는 이미 UEL 지원 확인)
- [x] `lib/analysis/free-board-bot.ts` POPULAR_LEADER_LEAGUES
- [x] `app/lab/LabClient.tsx` LEAGUE_KO
- [x] `jobs/post-daily-topic.ts` LEAGUE_PRIORITY·LEAGUE_KO·SOCCER

## 검증 (완료)
- [x] `npx tsc --noEmit` 통과
- [x] UEL 매치로 buildMatchContext·markets 실호출 → BTTS/DC 산출 확인
- [x] currentSeason("UEL", "2026-03-01") = 2025 확인

## 제외 (사유)
- 홈 `SeasonInsightCard` — 카드 10칸 고정, 예선·본선 혼재로 우승확률 왜곡. /predictions/UEL 이 대체 동선.
- `lib/i18n/en.ts` EN_PREDICTION_LEAGUES — 영어판은 별도 확장 결정 영역.
- `jobs/backfill.ts` — 수동 실행 스크립트, 자동 운영 아님.
- `lib/chatbot/*` — 사용자 본인 작업 영역, 수정 금지.

---

## UECL 후속 (같은 날)

UEL 과 동일한 19곳 + SPORT_PROFILE 에 UECL 추가.

- [x] markets SOCCER_LEAGUES_FOR_MARKETS + SPORT_PROFILE (484경기 실측 → totalStd 1.7 · marginStd 2.0)
- [x] build-context · types(PREVIEW_LEAGUES) · generate-analysis · generate-tactical
- [x] accuracy-stats(14→15) · accuracy 페이지 · backfill-corners · fetch-gpt-predictions
- [x] soccer-live-stats · picks(3곳) · picks/me · Footer("컨퍼런스리그") · live-scores · LeagueLeaderBoard · free-board-bot · lab · post-daily-topic
- [x] tsc 통과 · UECL 마켓 5/5 산출 · 기존 4개 리그 백테스트 수치 불변 확인 · 실렌더 확인
