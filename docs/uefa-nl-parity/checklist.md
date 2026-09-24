# 네이션스리그(UEFA_NL) → 5대 리그 급 — 체크리스트 (2026-09-24)

목표. 네이션스리그 경기 상세가 5대 리그처럼 승·무·패 AI 예측, 핸디캡·오버언더·양팀득점, 승부예측 3버튼+마켓 탭을 갖고,
프리뷰·분석·적중률·픽 등 노출 목록에도 들어간다.

## A. 국가대표 예측 기반 (성인 국대 대회 공통)
- [x] sport-leagues `SENIOR_NATIONAL_LEAGUES` + `historyLeaguesFor()` — 흩어진 "WORLD_CUP‖INTL_FRIENDLY" 판정 단일화
- [x] 국대 Elo(nationalElo) 적용: MatchInsight · build-context · predictionEngine(중복 함수 제거) · SoccerTeamStrength
- [x] 예측 이력 = A매치 전체: getLeagueMatches · predict-upcoming · generate-previews · evaluate-predictions · fetch-gpt-predictions(2) · qwen-panel · match-sim

## B. 승·무·패
- [x] predictionEngine FOOTBALL_LEAGUES_DRAW + UEFA_NL
- [x] MatchVoteCard DRAW_LEAGUES + UEFA_NL, picks DRAW_LEAGUES

## C. 마켓 (핸디·오버언더·양팀득점)
- [x] markets SOCCER_LEAGUES_FOR_MARKETS + SPORT_PROFILE UEFA_NL (A매치 종료 ~540경기 실측)

## D. 5대 리그 급 노출 (UEL 승격 fb1ecf6 목록)
- [x] build-context SOCCER_LEAGUES · types PREVIEW_LEAGUES · generate-analysis · generate-tactical
- [x] accuracy-stats · accuracy 페이지 · HeroSection
- [x] fetch-gpt-predictions MAJOR · backfill-corners
- [x] picks · picks/me · live-scores 라벨 · free-board-bot · lab · post-daily-topic · Footer

## 검증
- [x] 단위: 54개국 Elo·안도라-몰타 승무패·마켓 산출
- [x] tsc · 테스트
- [x] 배포 후 /live/UEFA_NL/1545601 실렌더 (AI 확률·3버튼·핸디/OU 탭)

## 추가로 드러난 것
- [x] compute-prediction·evaluate 가 buildMatchContext 에 팀 이름을 안 넘겨 국대 시드 Elo 가 저장 예측에 한 번도 안 쓰였음 → 원정팀 이름 조회 추가
- [x] 표본 게이트 면제가 월드컵만 → 성인 국대 전체
- [x] 월드컵 본선 48개국 Team row 중복 병합(2026-09-24) — 17개국이 아니라 48개국(한국 포함). 경기 135·대응표 67 재지정·빈 행 49 삭제, 충돌 0 → 네이션스리그 마켓 11/12
- 제외: /predictions 시즌 시뮬(조별 승강제라 리그 시뮬 부적합)·영어판 확장·순위 검사·리더보드(소스 없음)
