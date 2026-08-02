# 오프닝 배당 유사경기 카드 — 체크리스트

야구 3리그(MLB·NPB·KBO) 매치 상세에 "오프닝 배당이 비슷했던 과거 경기의 실제 결과"
카드를 추가한다. 근거·결정은 [context-notes.md](context-notes.md).

## 1. 데이터 계층

- [x] `src/lib/predict/opening-odds-similar.ts` 신설
  - [x] 대상 경기의 `openingMarketHome` 으로 같은 리그·`FINISHED`·스코어 보유 경기 조회
  - [x] 유사 밴드 ±0.03, 표본 부족 시 ±0.05 로 1회 확장
  - [x] 오염 배제 — 오프닝 홈확률 0.25~0.80 밖은 풀에서 제외
  - [x] 대상 경기 자체가 0.25~0.80 밖이면 `null` 반환 (카드 미표시)
  - [x] 최소 표본 미달(`< 20`)이면 `null` 반환
  - [x] 자기 자신 제외 (`id != target.id`)
  - [x] 무승부 별도 집계 (KBO·NPB 연장 무승부 존재)
  - 검증 완료 — production 실측 대조.
    MLB 2443043 n=234 시장 0.574 실제 0.526 / KBO 2472 n=64 시장 0.506 실제 0.516 /
    NPB 12840 n=25(±0.05 확장) 시장 0.629 실제 0.680.
    오염 경기 3건(oh 0.838·0.091·0.899) 전부 `null` 배제 확인.

## 2. 표시 계층

- [x] `src/components/predictions/OpeningOddsSimilarCard.tsx` 신설
  - [x] 시장 implied vs 실제 홈승률 대비 막대
  - [x] 홈승/원정승/무승부 건수 배지 (무승부 0 이면 숨김)
  - [x] 표본 수 명시 + 보장 아님 문구
  - [x] 다크/라이트 양쪽
  - 검증 완료 — 다크 `bg-white/[0.04]`·제목 lab 96.5, 라이트 `bg-neutral-100/70`·제목 lab 15.2.
    막대 색(시장 회색 / 실제 emerald)·판정 배지 색 양쪽 전환 확인.

## 3. 배선

- [x] `extraTabs` prop 활용 — MatchInsight.tsx 무수정
- [x] `src/app/live/mlb/[gameId]/page.tsx`
- [x] `src/app/live/kbo/[gameId]/page.tsx`
- [x] `src/app/live/npb/[gameId]/page.tsx`
- 검증 완료 — 3리그 실제 URL 에서 "오프닝 배당 비교" 탭 렌더 + 카드 수치가
  데이터 계층 검증값과 일치. 콘솔 에러 0건.

## 4. 마무리

- [x] `npx tsc --noEmit` 통과 (에러 0)
- [x] 임시 스크립트(`scripts/_*-tmp.mjs`) 정리
- [x] 커밋 (한국어, footer 없음) → `git push origin main` — 9cb1def
- [x] production 확인 — 3리그 모두 카드 렌더 (KBO 49.8% · MLB 57.8% · NPB 64.9%)

## 5. 사후 수정 — 무승부 분모 교정 (2026-08-02)

- [x] 결함 확인 — 시장값은 무승부 없는 2-way(실측 `openingMarketDraw` 전건 0,
      홈+원정 implied 합 = 1.0)인데 실제 홈승률만 무승부를 분모에 포함
- [x] `actualHomeWinRate` 분모를 `homeWins + awayWins` 로 교정, `decisiveSample` 노출
- [x] 카드 라벨·각주에 기준 명시 (무승부 있는 리그만)
- [x] 전수 스윕 — 렌더 N=1,540, 결론 문구 뒤집힘 KBO 27건(9.5%)·NPB 60건(18.8%),
      MLB 0건(무승부 0이라 무변화)
- [x] `npx tsc --noEmit` 통과 · eslint 0 problems
- [x] QA 조건부 PASS — 지적받은 각주 용어("2-way") 한국어 풀이로 교체
- [ ] `git push` — kimss 승인 대기

## 범위에서 뺀 것

- 축구 — 표본 미달(빅5 리그당 8~20건 < MIN_SAMPLE 20). **8월 개막 후 재검토**
  (context-notes 결정 1). "0건" 이 아니라 시즌 오프로 경기가 없었던 것.
- 긴장 레이더 — 파울 데이터 없음, 사용자 보류
- `football-match-stats.ts` type 매핑 불일치 — 별건
- 극단 오프닝값 수집 정정 — 별건 (표시 계층에서만 배제)
