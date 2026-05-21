# scorebase ROADMAP

> 작성: 2026-05-21 · 다음 리뷰: 2026-05-28
> 스타일: **작게 자주 PR** (안전 우선), 각 항목 = 1 PR 이하

## 🗺️ 한눈에 보기

| 트랙 | Q1 긴급+중요 | Q2 계획 | Q3 일괄 | 데드라인 |
|---|---|---|---|---|
| **외부 작업 (사용자만 가능)** | 3건 | 5건 | - | TheSports D-10 |
| **scorebase 코드** | 1건 | 7건 | 6건 | - |
| **인프라 (Mac mini)** | 2건 | 2건 | - | - |
| **AI 회사 (Phase 1~3)** | - | 4건 | - | - |

---

## 🔥 이번주 (~2026-05-28, D-7)

> 데드라인 있는 것 + Lightsail worker 동작 영향

### [USER] 외부 작업
- [ ] **TheSports 영업 이메일 발송** (sales@thesports.com) — 이미 작성됨, 미발송 · [S]
- [ ] **TheSports IP whitelist 등록** — 새 IP `27.74.132.49` · 옛 IP `89.147.101.139` 만료 · [S]
- [ ] **Lightsail firewall 등록** — 새 IP `27.74.132.49` SSH/8000 허용 · [S]

### [CODE] 한 PR씩
- [ ] **Anthropic retry 강화** — 3회 → 5회 + 30s backoff 확장 (`src/lib/anthropic/*`) · [M]
  - 효과: MLB/NPB/LOL PREVIEW 누락 감소 (id 11660/11662/12182, 12524/12526, T1 vs DRX)

---

## 🟡 다음주 (~2026-06-04, D-14)

### [USER] 결정/회전
- [ ] **TheSports 결제 결정** (~2026-06-01, D-10) — 영업 답변 받은 후 · [L]
- [ ] **네이버 서치어드바이저 등록** — meta 받으면 `layout.tsx` 추가 (별도 PR) · [S]
- [ ] **외부 계정 2FA** — Vercel · GitHub · GoDaddy · [S]
- [ ] **Telegram bot token 회전** — BotFather `/revoke` + 재발급 → Vercel env 업데이트 · [S]
- [ ] **시크릿 회전 (6개)** — `GOOGLE_API_KEY`/`FOOTBALL_DATA_KEY`/`ODDS_API_KEY`/`BALLDONTLIE_KEY`/`ODDSPAPI_KEY`/Neon DB URL/GitHub PAT · [M]

### [CODE] HealthCheck 잔존 5건 (각 별도 PR)
- [ ] **K_LEAGUE_1 scheduled-freshness 0건** — api-football collector 멈춤 의심 · [M]
- [ ] **SERIE_A 1X2 35% / BTTS 39% 적중률** — 시즌 막바지 anomaly 확인 · [L]
- [ ] **MLB player-name-missing 66%** — 한글 매핑 ⅓ 누락 backfill · [M]
- [ ] **match-count FINISHED 200%** (MLB/KBO/MLS) — `checkMatchCounts` 산식 검증 · [M]
- [ ] **BUNDESLIGA/LIGUE_1 scheduled-freshness** — 시즌 종료 인식 추가 · [S]

### [AI회사] Phase 1 마무리
- [ ] **Phase 1 MVP 재개 + 동작 검증** — Stage A~D 실행, 3명 회의 확인 · [M]

---

## 🟢 한달 내 (~2026-06-21)

### [CODE] Collector 전환 (NBA 패턴 복제)
- [ ] **NHL collector → API-Sports Hockey** — ESPN edge case 영구 회피 · [L]
- [ ] **MLB collector → API-Sports Baseball Pro** — ESPN edge case 영구 회피 · [L]

### [CODE] 데이터 품질 (각 별도 PR)
- [ ] **NBA Team "TBD" row 2개 cleanup** · [S]
- [ ] **MLS/NBA/LIGA_MX/A_LEAGUE leaderboard 양방향 매핑** (team-names.ts) · [M]
- [ ] **OddsPapi 404 endpoint 재확인** — `/api/v1/sports` 경로 수정 · [S]

### [예산] 월말 결제 사이클 전 검토
- [ ] **api-sports basketball v1 Ultra $39** — KBL/WKBL 추가 OR 다운그레이드 (현재 0% 사용) · [M]
- [ ] **The Odds API 5M $119** → Pro 50K $30 검토 (현재 0.04% 사용) · [S]

### [인프라] Mac mini follow-up
- [ ] **파일 마이그** — `.ssh/LightsailDefaultKey-*.pem` + `data/thesports-translations/` + `.claude/.../memory/` (AirDrop 또는 케이블 scp) · [M]
- [ ] **Tailscale 100.92.46.59 경로 timeout 해결** — `sudo pfctl -d` 시도 · [M]

### [AI회사] Phase 2~3
- [ ] **Phase 2: 풀팀 7명** (PM/SEO/디자인/개발/마케팅/분석가/QA) · [L]
- [ ] **Phase 3: 슬랙 UI** (채널/DM/스레드/멘션/아바타) · [XL]
- [ ] **AI회사 → scorebase 라이브 코멘터리 워커** — 맥미니 자체 실행, 1줄 코멘터리 · [L]

---

## 🔵 백로그 (사용자 미요청, 흥미 시)

### 🏀 신규 리그 추가 — KBL / WKBL (시즌 시작 전 진행)

> **언제**: 2026년 9월 (KBL 시즌 ~2026-10 시작 직전)
> **왜 보류**: 두 리그 모두 시즌 종료 (KBL 2026-05-13, WKBL 2026-04-26)

**API 정보 (확인 완료 2026-05-21)**:
- KBL: api-sports basketball league **id=91**, season `2025-2026`
- WKBL: id=**92** (W = Women's, 6팀 100매치)
- KBL Cup: id=266 (보너스)
- 결제 활용: api-sports Basketball Ultra $39/mo (현재 0% 사용)

**작업 단계 (NBA 패턴 복제)**:
- A-1: `src/lib/sports/types.ts` 에 `KBL`/`WKBL` League union 추가
- A-2: `src/lib/sports/api-kbl-collector.ts` 신규 (api-nba-collector 복제)
- A-3: `src/jobs/collect.ts` 라우팅 + `vercel.json` cron 등록
- A-4: 팀 매핑 (KBL 10팀 + WKBL 6팀) — Team.externalId
- A-5: UI 등록 — `/live/kbl/[gameId]`, 카드 컴포넌트, 리그 페이지
- A-6: (옵션) 지난 시즌 백필 — standings/leaderboard 표시

### 새 기능 후보
- Sportmonks Standard $69 가입 (축구 백업 source)
- NBA Pro boxscore fastBreakPoints 등 추가 fields
- Claude 1줄 events 코멘터리 (이제 Ollama로 무료화 가능)
- 선수 검색 확장 (LeagueLeader 이상 전 선수)
- `/transfers/[league]` 이적 페이지
- `/scores` 모바일 "내 팀" 섹션 (useFavoriteTeams)
- PWA + 푸시 알림 (즐겨찾기 매치)
- TheSports baseball `detail_live` worker
- 하위 리그 한글 매핑 (SERIE_B 28팀, LIGUE_2 39팀, CHAMPIONSHIP 33팀 등)
- AI회사 Phase 4: 메모리/페르시스턴스 (벡터 DB)
- AI회사 Phase 5: 페르소나별 MCP 도구 통합

### 모니터링 (자연 대기)
- 5개 TheSports 미해결 시즌 ID (AFC_CL/AFC_U23/CLUB_WORLD_CUP/J2/WORLD_CUP) — 시즌 시작 시 자동 cover
- 컵 league ID 첫 cron 실행 후 매치 수 검증 (KFA_CUP 366, EMPEROR_CUP 290 등)
- KBO 화요일 18:30 라이브 latency 측정

---

## 📊 사이즈 가이드 (PR 분량)
| | 시간 | 예시 |
|---|---|---|
| S | ~30분 | env 추가, 단일 함수 fix, 시크릿 회전 |
| M | 30분~2시간 | 컬렉터 1개 fix, HealthCheck 1건, UI 컴포넌트 1개 |
| L | 반나절 | 신규 collector 작성, 큰 모델 변경, Phase 1 MVP |
| XL | 1일+ | 풀 UI 리팩터, Phase 3 슬랙 UI |

---

## 🚦 진행 로그
- 2026-05-21: ROADMAP 초안 생성. AI 회사 트랙 신규 추가
