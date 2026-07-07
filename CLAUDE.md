# Scorebase — 프로젝트 컨텍스트

> **새 세션에서 5초 컨텍스트 잡기용**. 한국어로 답변. 사용자는 빠른 진행 선호.

## 한 줄 요약

한국향 AI 스포츠 미디어. **scorebase.kr** — 12개 리그 매치 데이터를 매일 자동 수집·분석·글 발행.

## 기술 스택

- Next.js 16 (App Router, Turbopack) · React 19
- Prisma 6 + **Neon Postgres** (운영 DB)
- Tailwind 4 + react-markdown + recharts
- Vercel (배포 + cron) · GitHub: `kimxylitol77/scorebase`

## AI · 데이터 소스

| 용도 | 서비스 | 키 |
|---|---|---|
| **글 작성** (PREVIEW/RECAP/ANALYSIS + blog-weekly 서술) | Claude **haiku-4-5** (`lib/ai/claude.ts` 경유) | `ANTHROPIC_API_KEY` |
| ~~글 작성~~ (구버전 — Vercel 키 미가동 실측 2026-06-12) | OpenAI gpt-4o-mini | `OPENAI_API_KEY` |
| 챗봇 (현재 비활성 — 사용자 작업 중) | Claude Sonnet 4.5 | `ANTHROPIC_API_KEY` |
| 축구 매치/라인업/통계 | **api-football Pro** ($19/mo) | `API_FOOTBALL_KEY` |
| 야구 매치 (KBO/MLB) | **api-sports baseball Pro** ($72/6mo) | `API_BASEBALL_KEY` (= API_FOOTBALL_KEY 동일 값) |
| MLB 선발 투수 | **MLB Stats API** (statsapi.mlb.com) — 무료 공식 | 없음 |
| NHL 골리 | **NHL 공식 API** (api-web.nhle.com) — 무료 공식 | 없음 |
| EPL 보조 | football-data.org | `FOOTBALL_DATA_KEY` |
| NBA·NHL·MLB 라이브 | ESPN unofficial | 없음 |
| 베팅사이트 odds | The Odds API | `ODDS_API_KEY` |

## 12개 리그

`EPL · LALIGA · BUNDESLIGA · SERIE_A · LIGUE_1 · MLS · UCL · WORLD_CUP · NBA · NHL · MLB · KBO`

## AI 모델 적중률 (현재)

| 마켓 | EPL | MLB | KBO | NHL |
|---|---|---|---|---|
| 1X2 | 59% | **54%** ⚾ starter 통합 | **60%** ⚾ recentEra w=0.35 | 54% 🏒 골리 통합 |
| Strong Pick (≥65%) | — | **60%** | **66.7%** | 57% |
| OU | — | 50% | 49% | **58%** |
| 핸디 | 59% | 59% | **63%** ✅ fix | **70%** 🥇 전리그 1위 |

> ⚠️ NHL 수치는 `/predictions/accuracy` 시즌 전체 실측 (2026-06-13, 1,409경기 predCorrect 기준). EPL/MLB/KBO 는 각 리그 튜닝 후 전용 백테스트값이라 측정 기준이 달라 직접 비교는 주의. 사이트 노출 실측은 accuracy 페이지가 단일 출처 (13개 리그 동적 산출).

## 자동 운영 (Vercel cron, KST)

```
06:00  collect (북미·유럽 야간 매치)
06:00  api-football (라인업·통계·predictions)
07:00  RECAP 글 생성 (어제 종료 매치)
12:00  collect (오늘 일정)
12:00  RECAP 2차
12:00  MLB 선발 투수 갱신
12:30  NHL 골리 갱신
21:00  베팅 odds 갱신
22:00  적중률 평가 (predCorrect 채움)
22:30  PREVIEW 글 생성 (향후 3일)
월 09:00 blog-weekly — 이적시장 위클리 자동 발행 (얇은 주 skip, ?dry=1 미리보기)
23:00  api-football 2차
월 11:00 ANALYSIS (맥미니) + 목 11:00 (Vercel) — 주 2회, 리그당 60h 가드
```

## DB 핵심

```prisma
model Match {
  predHome/Draw/Away    // 1X2 — Elo + starter/goalie + market blend
  predOverPick / predHcPick / predBttsPick / predDcPick
  marketHome/Draw/Away  // 베팅사이트 평균 implied (vig 제거)
  homeStarter/awayStarter   // MLB JSON
  homeGoalie/awayGoalie     // NHL JSON
  lineupHome/lineupAway     // 축구 JSON
}
model Article { type: PREVIEW|RECAP|ANALYSIS, slug: "{league}-{type}-{matchId}" }
model Notice { type: CHANGELOG|NOTICE|MAINTENANCE }
model PageView { userAgent, referrer ... }
```

## 글 페이지 자동 처리

매 글 본문 렌더 시점 자동 적용:
- **internal linking** — 30개 키워드 → 사이트 내 페이지 (max 2/글)
- **AiDisclosure** — "본 글은 AI·데이터 모델 협업, 운영진 모니터링" 표시
- **ExternalSources** — 종목별 권위 출처 (mlb.com·koreabaseball.com 등) `rel=nofollow`
- **JSON-LD** — NewsArticle + SportsEvent (10개 필드 풀: location/endDate/performer/offers 등)

## 핵심 파일

```
src/lib/predict/
  elo.ts                  # Elo 레이팅 (FiveThirtyEight MoV)
  win-probability.ts      # 1X2 base
  starter-adjust.ts       # MLB ERA·WHIP·K9 → winProb 가중
  goalie-adjust.ts        # NHL GAA·SV% → winProb 가중
  market-blend.ts         # 시장 odds 60% / 모델 40% ensemble
  markets.ts              # OU / 핸디 / BTTS / DC
  monte-carlo.ts          # 시즌 시뮬
  world-cup-simulation.ts # 토너먼트 시뮬
  world-cup-elos.ts       # 48개국 시드 Elo

src/lib/sports/
  api-football-pro.ts api-baseball.ts mlb-stats-api.ts nhl-api.ts
  world-cup.ts espn-*.ts

src/jobs/
  collect.ts generate-previews.ts generate-articles.ts(runRecap)
  generate-analysis.ts fetch-odds.ts fetch-api-football.ts
  fetch-mlb-starters.ts fetch-nhl-goalies.ts evaluate-predictions.ts

src/lib/
  internal-links.ts external-links.ts bot-detect.ts

src/components/
  MatchInsight.tsx        # 핵심 — winProb + StarterCard + GoalieCard + 배지
  Markdown.tsx            # autoLinkInternal 자동 적용
  pitch/Pitch.tsx         # 공용 축구 피치 (아래 규칙 필독)

src/app/
  articles/[slug]/        # 본문 + AiDisclosure + ExternalSources + JSON-LD
  players/[pid]/          # MLB 선수 상세
  leagues/[league]/       # 리그 페이지 (12개)
  predictions/[league]/   # 시즌 시뮬
  notices/                # 패치노트
  admin/stats/            # 사람 vs 봇 트래픽
```

## 축구 피치 렌더링 규칙 (필수)

**새 축구 피치(잔디+라인+선수 마커)는 반드시 `src/components/pitch/Pitch.tsx` + `PitchMarker` 를 쓴다. 손으로 새로 그리지 말 것.**

- 선수는 `<PitchMarker x={0~100} y={0~100}>` (피치 % 좌표)로 배치. 비율은 `aspect` prop 으로 페이지별 지정.
- **금지 1**: 센터서클·페널티박스를 고정 px div(`w-24 h-24` 등)로 그리기 → 창폭·화면비 바뀌면 선수(%)와 어긋난다(과거 world-cup/best-xi 버그).
- **금지 2**: 피치 라인 SVG 에 `preserveAspectRatio="none"` → 센터서클이 타원 됨. Pitch 는 `xMidYMid meet` + `viewBox==컨테이너 비율`이라 항상 정원.
- 원형 선수사진은 고정 정사각(`w-12 h-12`) 또는 `aspect-square` 로 — 윈도우 타원 깨짐 방어.
- 예외(공용 미적용, 손대지 말 것): `lineup/Pitch.tsx`(드래그·게임 핵심), `scores/soccer/SoccerLineupSvg.tsx`(line-spread 복잡), `api/og/*`(satori 엔진). 상세는 메모리 `pitch-component-unification`.

## 환경 변수 (.env.local + Vercel 양쪽 등록)

```
DATABASE_URL              # Neon Postgres
OPENAI_API_KEY            # sk-proj-... 메인 글 작성
OPENAI_MODEL=gpt-4o-mini
ANTHROPIC_API_KEY         # 챗봇 (현재 비활성)
API_FOOTBALL_KEY API_BASEBALL_KEY  # 같은 값
FOOTBALL_DATA_KEY ODDS_API_KEY
GSC_OAUTH_CLIENT_ID GSC_OAUTH_CLIENT_SECRET GSC_OAUTH_REFRESH_TOKEN  # GSC 검색 성과 (admin/stats) — 소유자 OAuth
GSC_SERVICE_ACCOUNT_JSON  # GSC 폴백 (서비스 계정 — GSC 사용자 추가 거부로 미사용)
ADMIN_USERNAME ADMIN_PASSWORD ADMIN_SECRET
SITE_URL=https://www.scorebase.kr SITE_NAME=Scorebase
CRON_SECRET
```

## 사용자 작업 스타일

- **빠른 진행 선호** — 옵션 제시 후 추천 명확히
- **한국어 답변 필수**
- ⚠️ **챗봇 (`src/components/Chatbot.tsx`, `src/app/api/chat/`, `src/lib/chatbot/`) 은 사용자 본인 작업 — 절대 staged/commit 하지 말 것**
- 큰 변경은 한 번에 push 선호
- commit 메시지는 한국어 + `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`

## 운영 명령어

```bash
# 로컬 dev (반드시 unset OPENAI_API_KEY 먼저 — 셸이 빈 값 export 함)
unset OPENAI_API_KEY; npm run dev

# 잡 수동 실행
npm run job:collect              # 매치 수집
npm run job:preview              # PREVIEW
npm run job:generate             # RECAP
npm run job:analysis             # ANALYSIS
npm run job:mlb-starters         # MLB 선발
npm run job:nhl-goalies          # NHL 골리

# DB
npx prisma db push --skip-generate && npx prisma generate
```

## 다음 작업 후보 (사용자 메모)

| 작업 | 시간 | 비용 | 우선순위 |
|---|---|---|---|
| 선수 이름 한글화 (Player 테이블 + AI 번역 캐시) | 1.5h | 월 ~100원 | 낮 |
| 축구 라인업 cron 빈도 6h → 4h | 1분 | 0 | 낮 (8월 새 시즌 전) |
| Naver Search Console 등록 | 5분 사용자 직접 | 0 | 중간 |
| KBO 선발 투수 — Data Sports Group 영업 문의 | — | $200+/월 | 검토만 |
| 챗봇 활성화 — Anthropic 크레딧 충전 (사용자 본인) | — | — | — |

## 알려진 한계

- **NHL 정규시즌은 4월 종료** → 5월 starter/goalie backfill 매핑 어려움 (다음 시즌 자동)
- ~~The Odds API KBO `active=False`~~ → **2026-06-12 활성화 확인** — KBO 배당 수집 중 (api-sports baseball 폴백 보유). ⚠️ marketHome 유입으로 KBO 1X2 시장 블렌드 자동 적용 시작 — 적중률 변동 시 1순위 확인
- **MLB Stats API sport=32 (KBO)** 등록만, 실제 데이터 ❌
- **선수 이름 100% 영문** — 한글화 미적용

## 발행된 Notice (운영 이력)

- #1 데이터 미디어 도약 — 5종 시장 적중률 + 시장 odds + Strong Pick
- #2 🏆 2026 FIFA 월드컵 통합
- #3 ⚾ MLB 1X2 48% → 54% (선발 투수 통합)
- #4 (6월 2탄) AI 예측 업그레이드(KBO 60%·Strong 66.7%) + 이적시장 8리그 + 감독 프로필 — `update-2026-06-transfers-coaches-ai`
