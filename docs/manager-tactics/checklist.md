# 감독 전술 연구 — 체크리스트

## Phase 1 — af 라인업 백필
- [x] scripts/backfill-af-lineups.ts (af season fixtures → 우리 Match 팀 쌍 매핑 → lineups, 2초 페이싱 + rateLimit 65초 백오프)
- [x] data/manager-lineups-epl-2526.json 생성 — 380/380, 미매칭 0, 라인업 없음 0
- [x] 매핑 실패분 사유 로깅

## Phase 2 — 감독 집계
- [x] src/lib/tactical/manager-aggregate.ts (+ af-lineup-fetch.ts 런타임 수집, manager-article.ts 공용 조각)
- [x] 감독 재임 구간 (coach 이름 연속 그룹핑)
- [x] 포메이션 분포·XI 고정도·최다 XI (좌표=주 포메이션 한정, 선발 횟수=시즌 전체)
- [x] xG 추이 (fixtureStats 378/380)
- [x] 샷 패턴 (shotmap 존·상황·박스 비중)
- [x] 표본 대조 — 아스널 1위 85점 71-27, 라야 37선발, 4-3-3 24회. 그리드 좌우 실측(칼라피오리 col1=왼쪽)

## Phase 3 — 위젯 + 렌더
- [x] prisma schema Article.tacticalContext 추가 — ⚠️ 배포 전 사용자 Neon ALTER 필요
- [x] TacticalManagerSection (헤더+스탯타일 / FormationBars / AvgPositionPitch / GoalShotmap / XgMonthly / 감독교체 표)
- [x] articles/[slug] + admin/review/[id] tacticalContext 분기 렌더
- [x] /lineup?d= 최다 XI 프리로드 링크 (라운드트립 11/11 검증)
- [x] 로컬 프리뷰 렌더 검증 (스크린샷 + DOM, 콘솔 에러 0, 가로 오버플로 없음)

## Phase 4 — 시즌 결산 글 생성
- [x] src/jobs/generate-manager-review.ts (sonnet 웹서치 + 본문, DRAFT, 멱등 가드)
- [x] --dry-run 상위 4팀 검증 (아스널·시티·맨유·빌라)
- [ ] **DRAFT 4편 실제 생성 — 선행: Neon ALTER 실행**
- [x] npm run job:manager-review 등록

## Phase 5 — 월간 이달의 감독
- [x] src/jobs/generate-manager-month.ts (af 런타임 수집, 승점/경기+xG 선정, 월중 감독교체 팀 제외)
- [x] /api/cron/manager-month + vercel.json 매월 2일 10시 KST — env MANAGER_MONTH_ENABLED 기본 OFF

## Phase 6 — 마무리
- [x] tsc 통과
- [x] 프로브·하네스 임시 파일 삭제
- [ ] DRAFT 검수 (admin/review — 대시보드 미리보기 포함) 후 PUBLISHED 전환
- [ ] 배포 (ALTER → push 순서 엄수 — 역순이면 Article 조회 전체 P2022)
