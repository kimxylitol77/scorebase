# 전술 분석 아티클 자동 생성 — 컨텍스트 노트

> 결정과 근거 기록. 계속 덧붙임.

## 왜 별도 타입인가

기존 `ANALYSIS`([src/jobs/generate-analysis.ts](../../src/jobs/generate-analysis.ts))는 **리그 시즌 종합**(판세·순위·핫팀). 전술 분석은 **매치/맞대결 단위 심층**(포메이션 상성·xG 흐름·키플레이어 매치업). 층이 다르므로 `Article.type = "TACTICAL"` 신설.

## 재사용 고리 (새로 짜지 않음)

- `Article` 모델 — `type` 문자열만 추가. content(Markdown)·status·slug·스냅샷 필드 그대로.
- `buildMatchBrief` / `buildMatchContext` ([src/lib/chatbot/match-brief.ts](../../src/lib/chatbot/match-brief.ts)) — 이미 매치 단위 Elo·폼·H2H·xG(fixtureStats 파싱)를 조립. 여기에 라인업·매치스탯만 얹으면 전술 컨텍스트 완성.
- `generateWithMinLength` + Claude `generate` ([src/lib/ai/generate-with-min-length.ts](../../src/lib/ai/generate-with-min-length.ts)) — 본문 생성 = **Claude 기반**(OpenAI 아님). 최소 분량 가드 + expand 재시도 그대로.
- 발행 패턴 — generate-analysis 의 "임시 slug → create → ID 기반 slug update → PUBLISHED" 복제.

## 데이터 — 있는 것 / 없는 것

있음(메이저 리그 한정):
- xG + rolling xG 모멘텀 — `fixtureStats` JSON(af /fixtures/statistics, [home,away] 순서 고정), predictionEngine rolling-xg.
- 포메이션 + 그리드 포지션 + 감독 — 라인업 캐시(`lh.formation`, `lh.coach`, [grid-position.ts](../../src/lib/players/grid-position.ts)).
- 매치스탯 — 코너·슈팅 등 `MatchStats` 테이블([api-football-corners.ts](../../src/lib/sports/api-football-corners.ts)).
- 인시던트 타임라인 — 골·카드 시점.
- Elo·1X2·핸디/OU 예측 컨텍스트.

없음(MVP 제외 — 별도 데이터 소스 필요 = 진짜 "상" 난이도):
- 패스 네트워크, 히트맵, 샷별 위치맵, PPDA·압박 지표.

## 핵심 결정

1. **Pre-match vs Post-match** — MVP는 **Post-match(경기 후 전술 리뷰)** 권장.
   - 근거: 실측 xG·실제 뛴 라인업·실제 스탯 전부 확정 → 사실 밀도 최고 = SEO 유리. 프리매치 라인업은 킥오프 ~1h 전에만 떠서 타이밍 압박 큼.
   - Pre-match 전술 프리뷰는 2단계로 후행.
2. **얇은 AI글 = SEO 역효과** ([메모리 feedback_ai_visibility_seo]). 데이터 게이팅이 성패. 포메이션+xG 둘 다 있는 경기만 생성, 없으면 스킵.
3. **대상 리그** — xG+라인업 보장되는 EPL·LALIGA·BUNDESLIGA·SERIE_A·LIGUE_1·UCL 로 시작.
4. **발행 게이트** — 초기엔 `status: "DRAFT"` 로 만들어 수동 검수 → 품질 확인 후 자동 PUBLISHED 전환.

## Phase 1 검증 결과 (실측, 2026-07-10 prod DB)

게이트는 정확히 동작(통과/탈락 분리·사유 정확). **병목 = 라인업(포메이션) 커버리지**.
- xG 는 거의 전부 있음(시즌 중 60경기 중 48~60). `fixtureStats` 파이프라인 커버리지 넓음.
- 포메이션은 킥오프 직전 api-football 로 수집돼 **과거 경기 대부분에 없음**. 전체 380경기 중 통과는 EPL 24·LALIGA 38·SERIE_A 30·BUNDESLIGA 14·LIGUE_1 18·UCL 1.
- **시즌 중** 최근 60경기 기준으론 포메이션 EPL 25·LALIGA 38·SERIE_A 30 → 게이트 통과 ≈ **인시즌의 40~63%**. MVP 로는 충분(빅매치만 대상이므로 볼륨보다 품질).
- 지금(7월)은 유럽 비시즌 → **라이브 생성은 새 시즌(8월)부터**. MVP 는 지금 만들고, 지난 시즌 통과분(리그당 24~38경기)으로 검증 후 새 시즌에 라이브 가동.

### 파생 결정 필요 — 게이트 강도
- (A) 포메이션 하드 게이트 유지: 전술 깊이↑, 대상 인시즌 40~63% (권장 — 빅매치 품질 위주).
- (B) 포메이션 선택 + xG 만 하드 게이트: 대상 거의 전부, 대신 "포메이션 상성" 섹션 약화 → 일반 xG 리뷰에 가까움.

## 열린 질문

- 대상 경기 선정 기준: Elo 상위 맞대결 자동 + 라이벌전 수동 화이트리스트?
- 생성 빈도/한도(주 몇 편)? ANALYSIS 는 색인 유일 타입이라 양산 가드 존재 — 전술도 동일 가드 필요.
- 렌더: 순수 Markdown 으로 갈지, 포메이션 도식/xG 차트 카드(baseballContext 처럼 JSON prop)까지 얹을지.

## 첫 발행 (2026-09-05) — 아스톤 빌라 0-1 아스널 (#4600, `/articles/epl-tactical-4600`)

- 사용자 지시로 `--match=1160800` 단건 생성 → 검수 → PUBLISHED 전환. cron 은 여전히 `TACTICAL_ENABLED` OFF.
- **팀명 영문 노출**: 컨텍스트가 `homeTeam.name` 원문을 넣어 제목·본문이 "Arsenal" 로 나갔다 → `toKoreanTeamName` 주입(ANALYSIS 와 같은 교훈). 선수명은 사이트 표준대로 영문 유지.
- **홈/원정 수치 스왑 함정**: 같은 컨텍스트로 두 번 생성했더니 한 번은 "아스널 39%·빌라 61%"(틀림), 한 번은 "아스널 61%"(맞음). 데이터 블록은 정확했고 모델이 홈/원정을 뒤바꾼 것. 발행 전 원본(fixtureStats·matchStats)과 대조가 필수 — 자동화 전에 본문 숫자를 데이터와 기계 대조하는 게이트(점유율·xG·슈팅·코너 4종)를 넣어야 PUBLISHED 자동 전환이 안전하다.
- 프롬프트에 득점자·어시스트·교체 추측 금지, 한글 팀명 그대로 사용 규칙 추가. 첫 dry-run 에 "Havertz 가 마지막 슈팅에 관여했을 것으로 보인다" 류가 있었다.
