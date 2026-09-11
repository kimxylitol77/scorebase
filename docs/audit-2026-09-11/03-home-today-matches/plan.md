# 감사 과제 3 [P0] — 홈 첫 화면에 오늘 주요 경기 6

> 지시서 `docs/SCOREBASE_AUDIT_2026-09-11.md` §3. 브랜치 `audit/03-home-today-matches`.

## 무엇을
히어로 높이를 절반 이하로 줄이고 바로 아래에 「오늘 주요 경기 6」 블록. 선정 = 관심팀 → 킥오프 ±3h → 리그 티어, 축구 3경기 쿼터, 카드마다 배당 1X2 또는 모델 확률(승/무/패 라벨).

## 왜
라이브스코어 사이트인데 첫 화면에 경기 0건. 기존 「오늘의 AI 매치 인사이트」는 3경기·야구 편중·리그 전체 Elo 재계산으로 무겁다.

## 어떻게
1. `src/lib/home/today-matches.ts` — `loadTodayMatchCandidates()`(서버, ARTICLE_LEAGUES·KST 오늘·부족하면 +24h) + `rankTodayMatches(cands, nowMs, favTeamIds)`(순수: 관심팀 → ±3h/LIVE → 티어 → 근접, 축구 ≥3 쿼터).
2. `src/components/HomeTodayMatches.tsx`(클라이언트) — 서버 후보 30개 + serverNow 로 첫 렌더(서버와 동일 → hydration 안전), 마운트 후 관심팀·현재시각 재정렬 + `/api/matches/by-ids` 로 상태·점수 갱신(LIVE 있으면 60s 주기). 카드 = 리그·시각/LIVE/종료·로고·팀명·점수·배당 1X2 또는 모델 확률.
3. `HeroSection` 여백·글자 축소(py-16/20 → py-7/9, h1 4xl/5xl/6xl → 3xl/4xl/5xl). `page.tsx` 순서: Hero → HomeTodayMatches → MyTeamsStrip → FocusCards…; `HomeAiInsightShowcase` 제거(컴포넌트·EN 미러·사전).
4. EN 미러 `/` 재생성.

## 검증
- rank 단위 테스트(쿼터·관심팀·±3h·티어·축구 3개 미만 예외).
- 1280×800·390×844: 히어로 높이 before/after(≤50%), 첫 카드 top < viewport.
- 오늘 실데이터 6경기 중 축구 ≥3(축구 경기 있는 날). 비로그인 = localStorage 없음 = 같은 블록.
- 홈 DOM 요소 수 ≤ 2,087(1,605 × 1.3). EN 잔여 한글 0.
