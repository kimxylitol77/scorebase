# 이적시장 데일리 자동 발행 — 계획

2026-07-12. Post 652("[분석팀 픽] 토트넘")를 원형으로, 이적시장 변경이 있는 팀들을 매일 1글로 자동 발행한다.

## 무엇을

- 매일 09:00 KST, 지난 24시간 신규 이적(주목 건만)을 모아 커뮤니티 글 1개 발행.
- 형식(사용자 확정): **포커스 팀 1개 집중 + 나머지 팀 다이제스트**.
  - 포커스 팀: 그날 영입 가중치(이적료 합 + 영입 선수 시장가치 합) 최고 팀. 652식 구성 — 영입 요약, 스쿼드 가치(예상 XI 시장가치 합·최고 몸값 3인), 감독 선호 포메이션 기반 **예상 베스트 XI 라인업 보드 임베드(lineupCode)**.
  - 다이제스트: 나머지 주목 이적을 리그별 불릿.
  - **맞대결(조건부)**: 같은 날 2팀 이상이 유의미한 영입(가중치 임계 이상)이면 두 팀 예상 XI versus 보드로 임베드.
- 주목 이적 0건인 날은 발행 스킵(소음 방지).

## 왜

- /analysis 커뮤니티에 매일 데이터 기반 콘텐츠 공급 + /lineup 전술판 도구 홍보(임베드 클릭 → 직접 수정 유도).
- 652 수동 작성의 반복 부분(지출 집계·스쿼드 가치·XI)이 전부 데이터로 자동화 가능함을 확인.

## 어떻게 (구성요소)

1. `src/jobs/generate-transfer-daily.ts` — 선정·집계·보드 생성·LLM 본문·발행.
2. `src/app/api/cron/transfer-daily/route.ts` — 얇은 크론 라우트. `TRANSFER_DAILY_ENABLED=1` 게이트(기본 OFF=과금 안전, TACTICAL_ENABLED 패턴).
3. `vercel.json` — `0 0 * * *` (09:00 KST).

## 데이터 소스 (조사 확정)

- 신규 이적: `FootballTransfer.updatedAt >= now-24h` (updatedAt = first-seen 소식일. transferTime 은 7/1 무더기라 부적합). 리그는 /transfers 피드 8리그.
- 주목 필터: transferFee > 0 OR 영입 선수 `PlayerMarketValue.currentValue >= €3M` OR aiBrief 존재. 임대복귀(type 2)·은퇴 제외.
- 스쿼드/감독: `data/team-squads.json`(154팀, ts team id 키) + `data/team-coaches.json`(감독 nameKo·preferredFormation). FootballTransfer 의 toTeamId 도 ts team id — 매핑 불필요.
- XI 선발: 포메이션 슬롯(GK/DF/MF/FW)별 시장가치 상위. 보드 인코딩 `encodeBoard()`(lineup-state.ts, Node 호환).
- 본문: `generate()`(claude.ts, haiku 기본) 1회. 구조화 사실만 넣어 창작 차단.
- 발행: `prisma.post.create` — 분석팀 계정(manager@scorebase.internal), category FREE, lineupCode. post-daily-topic.ts 의 하루 1개 가드 패턴 재사용.
