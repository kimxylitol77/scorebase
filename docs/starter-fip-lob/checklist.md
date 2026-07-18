# 선발 비교 FIP·LOB% 추가 — 체크리스트

> 계획: KBO PREVIEW 선발투수 비교 블록(비교바 + 본문 컨텍스트)에 FIP·LOB% 추가.
> 배경: 스탯티즈 AI 대회로 KBO 세이버 지표 관심 상승. 기존 ERA·WHIP·K9 옆에 두 지표 추가.
> 발견된 기존 결함: match-preview 프롬프트가 "선발 FIP 필수"를 요구하는데 FIP 값이 컨텍스트에
> 공급된 적이 없음 → 본문 FIP 수치 환각 가능성. 이번 작업이 이 결함도 해소.

## 데이터 추출
- [x] `src/lib/sports/baseball-saber.ts` 신설 — calcFip(리그 상수)·calcLobPct 헬퍼
- [x] `kbo-official.ts` — KboPitcherStats 에 hbp·r 추가 + 파싱 2줄
- [x] `kbo-starters.ts` — KboPitcherFullStats 에 fip·lobPct + enrich 시 계산
- [x] `npb-starters.ts` — stats 서브셋에 fip·lobPct + enrich 시 계산 (성분 이미 완비)
- [x] `mlb-stats-api.ts` — MlbStarter 에 fip·lobPct + fetchPitcherStats 에서 계산

## 저장·프롬프트·UI
- [x] `fetch-baseball-starters.ts` — StarterJson + build/buildNpb 에 fip·lobPct
- [x] `generate-previews.ts` — KBO buildJson 에 fip·lobPct
- [x] `match-preview.ts` — starters 타입 + fmt 주입 + FIP 지시문을 "제공값만 사용"으로 교정
- [x] `MatchInsight.tsx` — MlbStarterInfo 필드 + StarterStatBar 2행(FIP·LOB%) + 범례 갱신

## 검증
- [x] `npx tsc --noEmit` 통과
- [x] calcFip/calcLobPct 수치 검산 (알려진 성분 → 기대값)
- [x] KBO 실측: fetchKboStartersToday + enrich 로 오늘 선발의 fip·lobPct 실제 산출 확인

## 후속 (계획만)
- [ ] FIP 리그 상수 시즌 단위 재검토 (KBO 3.7 · NPB 2.9 · MLB 3.15 — 득점 환경 근사치)
- [ ] generate-previews NPB 경로는 이름만 저장하는 구버전 — starters job 이 덮으므로 방치, 추후 통합
