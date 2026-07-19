# AI 픽 발행 게이트 컨텍스트 노트

## 2026-07-19 백테스트 근거 (채점 4,062건, 06-27~07-17)
- 1X2 시장 역행 저확신 픽: 적중 30~44% (모델별). 게이트 시 grok +6.7%p, scorebase +4.6%p 등 6/7 모델 개선. 오프닝 배당 기준으로 lookahead 최소화 검증.
- 핸디(야구 -1.5): HOME(-1.5 커버) 픽 합산 41.1% ≈ 베이스레이트 37.3% (스킬 0). AWAY(+1.5) 픽 68.4% (베이스 62.7% 대비 +5.7%p 실제 스킬). HOME 픽 제거 시 전 모델 개선.
- OU: scorebase 59.3%, 나머지 모델 44~48%. 시장 역행 게이트는 신호 없음(순응 50.0 vs 역행 50.5).
- 게이트 B(약점 리그 차단)는 시간분할 검증에서 근거 없음 → 기각. K리그 11%는 n=19 노이즈.

## 설계 결정
- 방식 = 미발행(스킵). 강등 표시보다 단순하고 목적(게시 승률)에 직결. UI 는 결측 안전 확인
  (AiRoundTableStrip=1X2 개수만, scorecard=존재 행만 렌더).
- 게이트 위치 = storeAnchor/storePanel/backfill 3관문. upsertPrediction 호출 전 차단.
  qwen 맥미니 경로도 saveQwenPicks→storePanel 이라 자동 커버.
- 1X2 시장 우세 = Match.marketHome/Draw/Away(The Odds, vig 제거) 우선, 없으면 oddsHome/Draw/Away
  (raw decimal) implied 로 fallback — 야구는 marketHome 미저장 정책(블렌드 방지 주석)이라 fallback 필수.
- 핸디 게이트 스코프 = BASEBALL_LEAGUES && line>=1 만. 축구 -0.5 핸디는 HOME 픽 의미가 달라(홈 승) 증거 없음 — 건드리지 않음.
- 배당 없는 경기 = 게이트 통과(판단 불가 시 발행 유지). 픽 개수 과도 감소 방지.
- 킬스위치 = env PREDICTION_PUBLISH_GATES=off.
- 패널 프롬프트는 그대로(OU 질문 유지, 저장만 차단) — 외과적 변경 원칙. 프롬프트 수정은 별건.

## 함정·주의
- (구설계 시절 우려였던 scorebase HC 앵커 소실 문제는 published 설계로 해소 — 행이 항상 존재.)
- 핸디 시장 배당 필드(oddsHcHome/Away) 홈/원정 시맨틱 의심 이슈는 별건 후속 (역행 74% 비정상 4분면).
- 채점 컨벤션 주의: AiPrediction 채점은 markets.ts handicapCorrect(HOME=margin>line), analysis 봇은
  scoring.ts settlePick(home+line) — 서로 다른 라인 부호 관례. 혼용 금지.

## 2026-07-19 구현 중 설계 변경 — published 플래그
- 최초 설계(미저장 스킵)는 함정 발견으로 폐기. 중복 방지가 "1X2 행 존재"(doneByPanel)·"HC/OU 행 존재"(백필 doneSet) 기준이라,
  행을 안 만들면 같은 경기에 LLM 을 매 실행 재호출(비용 루프) + 통과할 때까지 재추첨하는 선택 편향 발생.
- 확정 설계 = 전 픽 저장 + published Boolean(@default true). 게이트 차단 시 published=false.
  회원 노출·성적표 5곳만 published:true 필터. 채점(runEvaluateAiPredictions)·postmortem 은 전 행 대상 유지
  → 게이트가 걸러낸 픽의 실제 적중률을 계속 측정해 게이트 유효성을 사후 검증할 수 있음.
- qwen-panel 의 앵커 라인 조회도 전 행 대상이라 scorebase HC 픽이 미발행이어도 라인 앵커는 살아있음.
- 배포 순서 = ALTER 먼저(구코드는 새 컬럼 무해) → 코드 배포. 역순이면 published 필터 쿼리가 P2022 로 성적표·홈 위젯 500.
