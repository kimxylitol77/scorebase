# /live/SERIE_A/737156 — 디자인 리뉴얼 brief

스코어베이스 (한국 스포츠 미디어) 의 축구 라이브 매치 상세 페이지. 종료된 매치 케이스 (Napoli 1-0 Udinese, 2026-05-24 Serie A 38R).

이 문서를 ChatGPT 에 그대로 paste 하면 각 카드가 어떤 데이터를 어디서 가져오는지 + 실제 값까지 알고 디자인 제안 가능.

---

## 기술 stack

- Next.js 16 App Router, React 19, Tailwind CSS, dark mode 지원 (`dark:` prefix)
- 카드 base 스타일: `rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-3 sm:p-4`
- 모바일 우선, 너비: `max-w-4xl mx-auto`
- 색상 규칙: 홈팀 blue (`text-blue-600 dark:text-blue-400`), 어웨이팀 rose (`text-rose-600 dark:text-rose-400`), 골 emerald, 카드 amber/rose, VAR purple, 라이브 LIVE rose

## 페이지 헤더

```
라이브 스코어 › Serie A › Napoli vs Udinese
나폴리 vs 우디네세
Serie A · Regular Season - 38 · 라이브 스코어 · 5초 자동 갱신
[⏱ 카운트다운 칩 — SCHEDULED 매치만]
```

## 매치 메타 (737156)

| 필드 | 값 |
|---|---|
| league | SERIE_A |
| status | FINISHED |
| score | Napoli 1 - 0 Udinese |
| startTime | 2026-05-24 16:00 UTC (5/24 25:00 KST) |
| home | Napoli (id=188, ext=114) |
| away | Udinese (id=182, ext=118) |

## 페이지에 렌더링되는 카드 (위→아래)

### 1. MatchArticleLinks
관련 분석글 (PREVIEW / RECAP) link 칩. 이 매치는 `serie_a-preview-79919` PREVIEW article 보유.

### 2. SportLiveDetail (메인 점수 카드, client polling 5s)
- 양 팀 로고/한글명/score 큰 카드
- 라이브 stats badge (점유율/슛/카드)
- 시청 옵션 (oddsHistory sparkline 포함 — 이 매치는 odds 0건)
- 라이브 commentary

### 3. MatchHeadToHead
- 양 팀 최근 5경기 form (W/D/L)
- 시즌 standing
- 평균 득점/실점
- 무승부 여부

### 4. SoccerVenueCard (홈팀 구장)
TheSports venue mapping 매치되면 표시. Napoli 의 Stadio Diego Armando Maradona.

### 5. MatchPredictionsCard (api-football /predictions)
승/무/패 확률 % + form/공격/수비/h2h/득점력 비교 bar + advice 텍스트.

### 6. TeamSeasonStatsCard (api-football /teams/statistics)
양 팀 시즌 통계 비교 — 최근 5경기 form chip + 경기수/승/무/패/득점/실점/무실점/무득점.

### 7. UpcomingFixturesCard (DB query)
양 팀 다음 SCHEDULED 매치 각 2개 — KST 시각, 홈/원정 배지, 상대팀.

### 8. SoccerGoalsCard (BeSoccer 스타일)
- 헤더: GOALS
- 골 시간 (33', 44', 48') | ⚽ 선수 | 👟 어시 | 원형 사진 아바타 + 팀로고 합성
- 이 매치: **1골** — Rasmus Hojlund (assist: Kevin De Bruyne) 24', Napoli

### 9. SoccerEventsTimeline (이벤트 타임라인, client toggle)
- **정렬 toggle**: 시간순 ↔ 최신순 슬라이드
- **필터 chip**: 전체 / 카드 / 교체 / VAR (count 배지)
- 골은 SoccerGoalsCard 로 분리, 여기엔 카드/교체/VAR 만
- home 좌측 / 가운데 분 / away 우측 grid
- 이 매치 incidents 총 20건 — type code (TheSports 매핑):
  - 1 = 골, 9 = 교체, 3 = 옐로카드, 4 = 레드카드, 28 = VAR
  - 11/12/19 = 시각 표시 (kickoff/HT/FT 등 — skip)

### 10. SubstitutionImpactCard
교체 후 ±10분 안 같은 팀 골 매칭. IN 선수의 영향도 시각화.
- 이 매치: 10분 De Bruyne IN ↔ Alisson Santos OUT → 14분 안에 24분 Hojlund 골 (De Bruyne 어시) — **연관 골 1건**.

### 11. SoccerTeamStatsCard / SoccerLiveStatsCard (팀 stats)
- 팀별 named fields v3 (teamStats) 우선
- 없으면 detail_live.stats (type-coded) fallback
- 이 매치 type-coded 10 stat: 점유율 25/45 (away/home), 슛 (type=4: away 1 home 0), 유효슛 (type=21: away 3 home 6) 등

### 12. SoccerHalfTimeStatsCard
전반/후반 stats 비교. p1 (전반), p2 (후반), ft (풀타임).

### 13. MatchTrendChart (모멘텀)
1분 단위 attack momentum (-100~+100) — 전반 + 후반 두 area chart.
- bar 형태, 골 marker, 점수 라벨

### 14. SoccerLineupSvg (라인업)
- 양 팀 포메이션 SVG 다이어그램
- 이 매치: 양 팀 모두 3-4-3, 각 21명 (선발 11 + 벤치)
- 각 선수: 사진 + 등번호 + 위치 + captain badge
- sample: Alex Meret (G, #1, rating "0.0")
- **참고**: 1% 매치만 rating 채워짐 — 대부분 "0.0", 표시 가치 낮음

### 15. SoccerGoalDistributionCard
양 팀 시간대별 골 분포 (0-15, 16-30, ..., 76-90).

### 16. SoccerH2HCard
양 팀 최근 H2H 매치 + 그때 odds.

## 카드 데이터 source 요약

| 카드 | source | 신선도 |
|---|---|---|
| SportLiveDetail | `/api/live/match/{gameId}` (5s polling) | 매우 fresh |
| MatchHeadToHead | DB 쿼리 + getFullStandings | DB 즉시 |
| SoccerVenueCard | static venue mapping JSON | 정적 |
| MatchPredictionsCard | api-football /predictions (Vercel fetch cache 600s) | 10분 stale OK |
| TeamSeasonStatsCard | api-football /teams/statistics (1800s) | 30분 stale OK |
| UpcomingFixturesCard | DB Match table | DB 즉시 |
| SoccerGoalsCard | TheSports detail_live.incidents (filter type=goal) | 라이브 2s push |
| SoccerEventsTimeline | TheSports detail_live.incidents (filter card/sub/var) | 라이브 2s push |
| SubstitutionImpactCard | 위 incidents 자체 매칭 | 라이브 |
| SoccerTeamStatsCard | TheSports teamStats (named v3) | 라이브 push |
| SoccerHalfTimeStatsCard | TheSports halfTeamStats | 라이브 push |
| MatchTrendChart | TheSports trend.data (per 1분, 2 array — 전후반) | 라이브 push |
| SoccerLineupSvg | TheSports lineup.{home,away} (객체) | 매치 시작 직전 |
| SoccerGoalDistributionCard | TheSports analysis.goal_distribution | 시즌 누적 |
| SoccerH2HCard | TheSports analysis.history.vs (양 팀 매치 30건) | 시즌 누적 |

## 디자인 요청

1. 현재 디자인은 카드가 위→아래로 17개 쌓이는 단조로운 흐름. 매치 페이지가 너무 길어짐.
2. 모바일에서도 깔끔하게, 정보 우선순위 명확하게 보이도록.
3. 다크모드 / 라이트모드 양쪽 OK.
4. 인기 매치 시 사용자가 가장 보고 싶은 데이터 (점수 → 이벤트 → 라인업 → 통계) 우선순위 강조.
5. 종료 매치 vs 라이브 매치 vs 예정 매치 별로 강조 다르게 (예: 예정 매치는 라인업/예측 우선, 라이브는 stats/timeline 우선, 종료는 골/highlights 우선).

## ChatGPT 에 부탁할 것

- 카드 reorder + 시각적 hierarchy 제안
- 카드 그룹화 (탭? 아코디언? 가로 스크롤?)
- 상태별 (SCHEDULED/LIVE/FINISHED) 레이아웃 변경 전략
- BeSoccer 같은 reference 사이트와 비교한 개선점
- Tailwind 클래스 단위로 구체적 변경 제안 (코드 그대로 적용 가능하게)
