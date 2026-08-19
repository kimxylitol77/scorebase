# PlayerEvent 체크리스트

## Phase 1 — 테이블 + 3종 규칙 + UI  ✅ 완료 (2026-07-14, 배포 진행)

### 스키마
- [x] PlayerEvent 모델 추가 (id=소스 자연키, playerId, type, occurredAt, title, detail Json?, matchId?, @@index)
- [x] CREATE TABLE(prisma migrate diff) → 신규 빈 테이블이라 pg_dump 동작 중에도 안전 → 직접 실행. prisma/sql/create-player-event.sql
- [x] `npx prisma generate` → tsc 통과

### 수집 잡
- [x] `src/jobs/collect-player-events.ts` 신설
- [x] TRANSFER/LOAN — 실이동 type {1,2,3,6,7}, team_id→우리 Team 한글명 해소(영문 접미사 회피)
- [x] VALUE_UP/DOWN — mv.history 직전 대비 ±5% 이상만(소음 제외)
- [x] INJURY/RETURN — **TheSports lineup.injury(ts player id 키, 퍼지매칭 없음)**. start_time→INJURY, end_time>0→RETURN
- [x] 백필 완료 157,901건(TRANSFER 51.2k·VALUE 89.5k·LOAN 16.6k·INJURY 482·RETURN 60), 13,448명
- [x] `/api/cron/player-events` + vercel.json cron (월 16:00 UTC = 화 01:00 KST)
- [x] 멱등 검증 — createMany skipDuplicates, 재backfill scanned==created(중복 0)

### UI
- [x] RecentTimeline — 최신순, 최근 8건 + `<details>` 더보기, 유형별 색 배지·점
- [x] 개요 탭 최상단 배치, 이벤트 0건 선수 미표시
- [ ] matchId 경기 링크 — P1 skip(리그 코드 미보유) → P2

### 마무리
- [x] 산투스 19건 타임라인 정상(브라우저), 섹션 최상단, 더보기 11건
- [x] tsc 통과 + 브라우저 검증 → commit → push

## Phase 2 — 활약·밀스톤·국대
- [ ] PERFORMANCE — playerStats 주간 집계 (골 있는 경기만 이벤트화)
- [ ] MILESTONE — 시즌 N호골(5단위)·해트트릭·데뷔·퇴장
- [ ] NATIONAL — 국대 라인업 등장 감지
- [ ] cron 운영 1주 관찰 (이벤트 볼륨·노이즈 확인)

## Phase 3 — 요약 + 커리어 자동화
- [ ] 포커스 75명 주간 한 문단 요약 (Claude, 주 75콜)
- [ ] Wikidata P54 주간 재동기 → player-overrides.json career 자동 갱신
