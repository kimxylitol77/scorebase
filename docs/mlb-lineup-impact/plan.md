# MLB 라인업 임팩트 탭 — 계획 (2026-09-23)

**무엇.** `/live/mlb/{gameId}` 경기 상세의 MatchInsight 탭에 "라인업 임팩트" 를 추가한다. 확정 타순 9명으로 팀 기대득점(xR)을 내고, 선수별로 "A 대신 벤치 평균 타자가 들어갔을 때 기대득점이 얼마나 빠지는가"(Δ) 를 보여준다. 백로그 "WOWY식 라인업 임팩트 탭 [근거: databallr.com]" 의 1단계.
**왜.** 라인업 탭은 선수 사진과 시즌 성적을 나열만 한다. 배당·투표 화면 옆에서 "이 타순이 몇 점짜리인가·누가 빠지면 얼마나 아픈가" 를 숫자로 답하는 화면이 없다. 데이터가 이미 있어(statsapi 박스스코어 seasonStats) 새 수집 없이 만들 수 있다.
**새 페이지 없음.** 기존 경기 페이지 탭 하나. 불펜 피로도 탭과 같은 자리(page.tsx 의 MatchInsight tabs).

## 산식 (결정론, 재현 가능)
- 선수 wOBA = (0.69·uBB + 0.72·HBP + 0.89·1B + 1.27·2B + 1.62·3B + 2.10·HR) / (AB + BB − IBB + SF + HBP). FanGraphs 선형가중치 고정값. 성분은 박스스코어 `seasonStats.batting` 에 전부 있다(추가 호출 0).
- 타순별 경기당 타석 PA(slot) = 4.65 − 0.11·(slot−1) (1번 4.65 … 9번 3.77, 합 ≈ 37.9).
- 리그 기준: lgR/G·lgwOBA 는 statsapi `teams/stats?group=hitting&stats=season` 30팀 합계로 매일 1회 계산(unstable_cache 1일). 9/23 실측 lgR/G 4.484.
- 팀 xR = lgR/G + Σ_slot PA(slot)·(wOBA_i − lgwOBA)/1.2 (wOBA 스케일 1.2).
- 선수 Δ = PA(slot)·(wOBA_i − wOBA_bench)/1.2. wOBA_bench = 같은 팀 벤치 야수(박스스코어에 battingOrder 없는 비투수, PA 가중 평균). 벤치가 없으면 리그 평균 대체.
- 표본 게이트: 시즌 PA < 50 이면 그 선수 wOBA 는 리그 평균으로 수축(shrink: (PA·w + 50·lg)/(PA+50)). 표본 부족을 숫자처럼 보이게 두지 않는다.
- 2단계(선택): WOWY 원형 = "A 출전 경기 팀 R/G vs 결장 경기". people/{id}/stats?stats=gameLog + 팀 스케줄 필요 → 이번 범위 밖, 체크리스트에 보류로 남김.

## 화면 (databallr 에서 가져오는 것)
1. **게이지 두 개** — 홈·원정 xR 큰 숫자 + 리그 평균 대비 백분위 느낌의 라벨("리그 평균 +0.6").
2. **워터폴** — 타순 1~9 선수 Δ 막대를 왼쪽부터 누적, 점선이 누적합. 양수 rose·음수 회색. databallr IMPACT WATERFALL 문법.
3. **필 세그먼트** — "경기당 / 타석당" 전환(경기당 기본).
4. **보드 행 하이라이트** — 선택 선수 행 강조(선택 없으면 Δ 최대 선수).
5. 우리 토큰 그대로: 라이트 `bg-white ring-1 ring-black/5`, 다크 `dark:bg-white/[0.04] dark:ring-white/10`, rose 액센트, lucide 아이콘. databallr 의 네이비·골드는 가져오지 않는다.

## 노출 조건
- 양 팀 타순 9명이 확정된 경기만 탭 enabled. 확정 전엔 탭 비활성. 경기 후에도 유지(실제 득점과 나란히).
- 컴포넌트는 서버 컴포넌트(page.tsx 가 이미 받은 mlbBoxscore 재사용). 클라이언트 JS 는 필 전환뿐.

## 산출물
- `src/lib/sports/baseball/lineup-impact.ts` 순수 산식 + `lineup-impact.test.ts`
- `mlb-stats-api.ts` MlbBoxBatter 에 시즌 성분 필드·벤치 타자 노출(가산만)
- `src/components/live/LineupImpactCard.tsx`
- `src/app/live/mlb/[gameId]/page.tsx` 탭 등록
- KBO 이식은 후속(KboPlayerGameLog 로 같은 산식).
