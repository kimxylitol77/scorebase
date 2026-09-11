# 감사 과제 4 [P1] — /picks 를 「내 베팅 기록장」으로

> 지시서 §4. 브랜치 `audit/04-picks-record-book`.

## 현재 상태(조사)
- 지시서의 "배당을 저장하지 않음" 은 낡았다 — `MatchVote.pickOdds`(픽 시점 해외 평균 배당)·`createdAt` 이 2026-08-22 부터 저장된다(749표 중 316표에 배당, 나머지는 배당 없는 경기·그 이전 표). 요구 1 은 필드명만 다르고 이미 충족.
- `/picks`·`/picks/me` 가 각자 `units = Σ(correct ? odds-1 : -1)` 를 인라인으로 계산하고, `/predictions/accuracy` 의 플랫 유닛 ROI 도 별도 settle — 같은 규칙이 세 벌.
- "AI 를 이기는 중!" / "나 vs AI" 가 적중 수 비교로 남아 있다. `/lab` 백테스트는 적중률만.

## 어떻게
1. `src/lib/predict/flat-roi.ts`(순수) — `settleFlatUnits(bets)` 하나로 evaluated·wins·units·roi·excluded(배당 없음·이상치 제외 수). accuracy 의 model-vs-market, /picks, /picks/me, /lab 이 전부 이걸 쓴다(중복 제거).
2. `src/components/predictions/RoiCard.tsx` — accuracy FlatRoiSection 안의 RoiCard 를 공용 컴포넌트로 빼서 accuracy·/picks/me·/lab 이 같은 카드를 쓴다.
3. `/picks` 상단: `내 픽 N · 적중률 X% · 평균 배당 Y · 누적 Zu · 수익률 W%` + `배당 없음 N건 제외`. "같은 경기 AI 적중 / AI 를 이기는 중" 제거 → 기준선(모델 픽 전체·시장 인기픽 플랫 ROI, roiClaim 단일 소스) 한 줄. H1·설명을 기록장 성격으로.
4. `/picks/me`: 수익 카드를 lib 계산으로, 제외 건수 표기, "나 vs AI" 적중 비교 섹션 → 수익률 기준선 비교(내 ROI vs 모델 vs 시장 인기픽)로 교체.
5. `/lab`: BotFeature 에 원배당 3개 추가(route select·tuple·parse), `scoreBacktest` 가 봇 픽 배당으로 유닛 수익률도 반환, 결과 카드에 적중률+유닛 수익률(마감 배당 기준, 배당 없음 제외 표기).
6. EN 미러 `/picks` `/picks/me` `/predictions/accuracy` 재생성.

## 검증
- 단위 테스트: settleFlatUnits(제외·승패·이상치), scoreBacktest units.
- DB: 최신 표 1건의 pickOdds·createdAt 확인(요구 1). dev 렌더: /picks 상단 5지표+제외 표기, /picks/me 카드, /lab 백테스트 카드(적중률·수익률 동시), accuracy 수익률 값 변화 없음(−3.8%/−6.6%).
- tsc·eslint·EN verify.
