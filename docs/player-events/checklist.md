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

## FotMob식 리치 탭 3종 (API-Football, 이미 결제 Ultra) — 2026-07-14 착수
> 소스 확인: 클럽 경기 평점은 TheSports playerStats 비어있고 **API-Football이 채움**(사용자 지적).
> ts→af 매핑=data/ts-af-player-map.json(3,367명). 산투스 af=305834 라이브 검증 완료.

- [x] **근황 → 이적 탭 이동** (de32720) — 개요에서 제거, 이적 기록 위. 겹침은 추후 병합 검토.
- [x] **경력 탭** (850ad70) — 시즌별→경력 승격. `/players?season=` 시즌별 대회별 평점.
  - fetchPlayerCareer(afId) + career-data.ts(unstable_cache 1일 + 분류 + 한글화) + PlayerCareerTable(client)
  - 리그/컵대회/클럽대항전/국가대표팀 서브탭 + 합계. af 없으면 SeasonAccordion(WIKI) 폴백.
  - ⚠️ 분류 = league.type + 이름 휴리스틱(Friendlies/Sudamericano/Olympic→국대, UEFA/CONMEBOL→클럽대항전). 유스·주state 리그 edge case 잔존(허용).
  - ⚠️ **성능/quota**: 페이지마다 af 매핑 선수는 career fetch(시즌수+1콜) 실행 — 1일 캐시로 완화. 트래픽 급증 시 주간 잡으로 DB적재 전환 고려.
- [x] **부상이력 탭** (55cf488) — `/injuries?player=&season=` 최근5시즌 병렬. fetchPlayerInjuries + injury-data.ts(12h캐시, 경기별 플래그→스펠 그룹핑 45일이내연속, 부위 한글화, 정지 제외, 진행중 표시) + PlayerInjuryHistory(server). 스펠 있을 때만 "부상" 탭. 홀란 11스펠 검증. (PlayerEvent 병합은 미적용 — af가 더 넓은 이력 커버, 단일소스로 단순화)
- [x] **출전기록 탭** (dbfc2f3) — PlayerMatchLog 테이블 + collect-player-match-logs 잡(fixture 중심: 빅5+유럽+빅5컵 완료경기 /fixtures/players 경기당1콜 → af→ts 매핑 선수 적재, 동시성8) + 주간 cron(화 01:30 KST) + PlayerMatchLogTable(매치업·평점·벤치·승무패, 최근15+더보기). 백필 28,638행/2,025명. 산투스 33경기 검증.
  - fetchFixturesByLeagueId + fetchFixturePlayerStats(api-football-pro). id=match:{ts}:{fixture} 멱등.

## ✅ FotMob식 리치 탭 3종 전부 완료 (2026-07-14)
탭 구성: 개요 / 경력 / 출전기록 / 부상 / (경기=국대) / 이적(근황) / 히트맵. 소스=API-Football Ultra.

### 후속 3종 완료 (2026-07-14)
- [x] **① 근황↔이적기록 겹침 병합** (64f5f08) — 근황을 단일 통합 타임라인으로, 이적행에 도착팀 로고. 중복 이적기록 표 제거. 고아 import 정리.
- [x] **② 매핑 커버리지 확대** (7e16150) — build-ts-af-player-map 재실행. 3,367→3,461(+94, 주로 K/J/브라질 캘린더리그). 시즌스탯 2,965 갱신. **빅5는 이미 포화**(재매칭 +1) — 주요선수 이미 다 매핑됨. 더 넓히려면 미커버 리그 추가(ROI 낮음).
- [x] **③ quota 모니터** — 코드 불필요. `mac-mini-api-quota` 봇이 api-football 이미 감시(80%WARN/95%HIGH). 현재 26%(19k/75k, 백필 포함)라 여유. 리치탭 부하도 자동 커버.

### 출전기록 레이트리밋 fix (3f43642) — 라리가·세리에A 누락 해결
- 증상: 음바페(레알=라리가) 리그경기 0. 확인하니 라리가·세리에A·유로파·FA컵 등 통째 0행.
- 원인: 동시성8=분당~1,200콜 > api-football 분당450 → 429 조용히 빈응답. client()에 재시도 없음.
- fix: throttle 400/min(150ms)+동시성6 + fetchFixturePlayerStats 429 백오프재시도3회. 재백필 28,638→86,168행/2,855명, 14대회 전부. 음바페 44경기 확인.

### 알려진 잔여 (백로그)
- 출전기록 = **현 시즌만** + COMPETITIONS 빅5+유럽+빅5컵. 과거시즌·타리그(에레디비지·사우디·MLS·K/J/브라질)는 미포함(경력·부상은 live라 표시됨). 필요시 시즌 확장 / job COMPETITIONS 에 리그 추가.
