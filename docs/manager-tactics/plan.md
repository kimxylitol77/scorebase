# EPL 감독 전술 연구 아티클 — 계획

> 2026-07-18 시작. 사용자 결정. (1) 지금 비시즌 = 25/26 시즌 결산형 몇 편, (2) 새 시즌부터 월 1회 "이달의 감독", (3) 전술판 = 본문 인터랙티브 위젯 + /lineup 빌더 프리로드 링크 병행.

## 무엇을 만드나

감독 축의 전문 전술 연구 글을 자동 생성한다. 기존 TACTICAL MVP(경기 단위 리뷰)와 층이 다르다 — 이건 시즌/월 단위, 감독 단위 심층이다.

- 시즌 결산형: "아르테타의 아스널 25/26 전술 총정리" — EPL 상위권 감독부터 몇 편.
- 월간형: "이달의 감독" — 시즌 개막 후 월 1회 cron (기본 OFF 배선만).

## 데이터 실측 결과 (2026-07-18)

| 데이터 | 커버리지 | 소스 |
|---|---|---|
| 포메이션·감독·선발 XI·grid 좌표 | 시즌 전체 (af 히스토리 실측 11/11) | af /fixtures/lineups **백필 필요** |
| DB 라인업 | 19/380 (5월분만) — 그대로는 불가 | Match.lineupHome / ts cache |
| xG | 378/380 | Match.fixtureStats |
| 샷맵 (좌표·xG·상황·부위) | 380/380 | data/match-shotmaps-epl-2526.json |
| 선수 히트맵 원시 터치 좌표 | EPL 77명 | data/player-match-heatmaps.json |
| 선수 세부 포지션 실좌표 | 7,800명 | data/player-positions-detail.json |
| 감독 프로필·경력·선호 포메이션 | 있음 | data/team-coaches.json 등 |

함정. Match.externalId(numeric)는 af fixture id 가 아님 → af 매핑은 날짜+팀으로.

## 아키텍처 (Phase)

1. **af 라인업 백필** — scripts/backfill-af-lineups.ts → `data/manager-lineups-epl-2526.json` (380경기 formation·coach·XI·grid + 우리 matchId 매핑). 프로덕션 DB 무접촉, data/ 커밋 = 샷맵과 동일 패턴.
2. **감독 집계 레이어** — src/lib/tactical/manager-aggregate.ts. 팀별. 감독 재임 구간(중도 경질 감지), 포메이션 사용 분포, XI 고정도/로테이션, 최다 선발 XI, xG for/against 추이, 샷 패턴(존별 집계), 상위권 상대 성적.
3. **위젯 + 렌더** — Article 에 `tacticalContext String?` 컬럼(한 줄 ALTER 는 사용자가 Neon 에서 실행, db push 금지 관례). articles/[slug] 에서 JSON 파싱해 위젯 렌더. 위젯 3종 = 포메이션 사용 분포 / 평균 포지션 피치(실좌표) / 시즌 샷맵 피치. + /lineup?d= 최다 XI 프리로드 링크 버튼.
4. **시즌 결산 글 생성 잡** — src/jobs/generate-manager-review.ts. 집계 → 웹서치 보강(sonnet, transfer-xi 검증 패턴) → 본문 생성 → Article type=TACTICAL, status=DRAFT. slug=`epl-manager-{teamSlug}-2526-{id}`.
5. **월간 "이달의 감독" 잡** — src/jobs/generate-manager-month.ts + /api/cron. 월 1회, env 게이트 기본 OFF. 선정=월간 승점+xG 차 초과 성과.
6. **검수·발행** — DRAFT 검수 후 사용자가 PUBLISHED 전환. 첫 배치 4편(최종 순위 상위 4팀 감독).

## 성공 기준

- 백필 380/380 (미확정 라인업 있으면 사유 로깅).
- 집계 결과가 실제와 일치 (표본 팀 1개 수동 대조).
- DRAFT 4편 생성, 위젯 3종 + 빌더 링크 정상 렌더 (로컬 프리뷰 검증).
- tsc 통과.
