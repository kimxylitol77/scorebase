# 위키형 데이터 축적 1단계 — 컨텍스트 노트

> 결정과 근거. 작업 중 계속 덧붙인다.

## 비전 (사용자, 2026-08-09)

스코어베이스를 나무위키처럼 스포츠 데이터를 전문적으로 열람하는 곳으로. 경기가 끝나면 선수·팀 데이터가 계속 쌓이고, 쌓인 걸 사람들이 볼 수 있게. 3단계 계획 중 1단계 = 새는 곳 막기(역사 보존).

## 실측 현황 (2026-08-09)

- 이미 영구 축적 중: Match 43,864 · PlayerMatchLog 103,652 · PlayerEvent 158,550 · 트로피 20,184 · LeagueLeader(시즌 키 포함 — 시즌별 보존됨, EPL 2025-26 확인)
- 기존 위키형 자산: data/league-champions.json(27리그 역대 우승, 리그 "역사" 탭 노출 중) · data/team-history.json(20팀)
- **새는 곳**: TheSportsStandingsCache(league @id)·ApiFootballStandingsCache(league @id)·BasketballStandingsCache — 전부 리그당 1행, 시즌 롤오버 시 덮어쓰기
- af 캐시 실측: BUNDESLIGA 는 이미 season 2026(26-27)으로 넘어가 25-26 최종표 소멸. LALIGA·SERIE_A·LIGUE_1 등은 아직 2025 잔존 — 백필로 회수 가능(af 과거시즌 호출)

## 핵심 설계 결정

1. **시즌 종료 감지를 안 한다.** 매일 (league, seasonLabel) upsert — 롤오버로 라벨이 바뀌면 이전 시즌 행이 자연히 동결돼 최종 순위가 된다. 단순하고 자가치유.
2. **비정규화 저장.** rows 에 teamId 외에 name·ko·logo 를 굳혀 저장. 팀 병합·삭제(주피러 사례)에도 아카이브는 자립.
3. **축구는 getFullStandings() 재사용.** 시즌 게이트·ts 1순위·af fallback·그룹 리그(J1/J2) 처리가 전부 내장돼 있어 서빙 화면과 동일한 표가 아카이브된다.
4. **가드 2종.** 개막 전 placeholder(전 행 played 0) skip — standings-mismatch-preseason 메모리의 함정. 퇴행 방지(기존 행보다 played 합이 적으면 skip) — 최종표를 부분표로 덮는 사고 차단.
5. **NHL 라벨은 응답 seasonId 로.** 오프시즌(8월)에 /standings/now 는 지난 시즌 최종표를 주는데 computeSeasonYear 는 새 시즌을 리턴 → 라벨 불일치 위험. 소스가 주는 시즌을 신뢰.
6. **백필 팀 매칭 한계 수용.** ts 1순위 리그는 Team.externalId 가 ts id 라 af 팀 id 와 불일치(EPL 95% 실패 전례). 이름 정규화 매칭 시도 후 실패 시 teamId null — 위키 표시는 name/logo 로 충분, 팀 링크는 best-effort.

## 재사용하는 기존 부품

- `getFullStandings(league)` — src/lib/sports/thesports/standings-helper.ts (StandingsRow, teamId=우리 id)
- `seasonLabelFor(league, year)` + `resolveSeasonYear(league)` — season-calendar / season-registry
- `fetchBaseballTable(KBO|NPB)` · `fetchNhlStandings()` · `fetchBasketballStandings(NBA)`
- af /standings 호출 패턴 — src/app/api/cron/standings-collect/route.ts 의 fetchStandings 참조
- cron 패턴: cron-auth + recordCronRun + CRON_REGISTRY 등록(cron-execution-monitor 메모리 — 미등록 시 감시 사각)
- `toKoreanTeamName(name, league)` — 한글명 굳히기

## 주의

- 새 테이블은 raw SQL 생성(프로젝트 패턴 — db push 금지). prod DDL 은 lock_timeout 3s (prod-ddl-lock-incident)
- af 일한도: 8/9 주간 러너가 한도 소진 사고(handoff 참조) — 백필은 ~100콜 수준이라 안전하지만 실행 전 당일 사용량 인지
- 챗봇 파일 절대 커밋 금지
- 원격 main 이 워크트리보다 2커밋 앞 — push 전 pull

## 진행 로그

- 2026-08-09: 계획 수립, 실측 완료. 구현 시작.
- 2026-08-09: 1단계 구현·실행 완료.
  - 테이블 prod 생성. 일일 아카이버 첫 실행 = 126개 리그 저장, preseason 가드 17건 정확 동작.
  - 25-26 백필 = 138개 리그 저장 (af 과거시즌), 25개 empty(컵·단계형 — af 표 없음, 정상), 실패 0. 429 는 재실행으로 해소(스크립트 멱등 확인).
  - 최종 264개 (league, season) 행. 라벨 분포 2025:72 · 2025-26:70 · 2026:64 · 2026-27:58.
  - 우승팀 정본 대조 통과: EPL 아스널 85pt · 라리가 바르셀로나 94pt · 분데스 바이에른 89pt = league-champions.json 일치.
  - NHL 버그 수정: teamName 이 이미 풀네임인데 placeName 을 덧붙여 "Colorado Colorado Avalanche" — name 단독 사용 + Team 이름 매칭으로 교정(31/32 매칭, 콜로라도 애벌랜치).
  - 테스트 96개 통과.

## 관찰 (2단계에서 참고)

- WALES_PL 등 SPLIT_YEAR_LEAGUES 미등록 리그는 라벨이 "2025" 로 남는다(실제는 25-26 시즌). 코드베이스 전역의 seasonShapeFor 계약을 따른 것 — 고치려면 season-calendar 목록 추가가 선행 (다른 시스템 영향 실측 후).
- 스코틀랜드 하부 3리그는 af 팀 id·이름 모두 우리 Team 과 안 이어져 teamId 매칭 0 — name/logo 는 af 응답으로 보존돼 표시는 가능.
- NBA 팀 한글명은 toKoreanTeamName 사전에 없어 ko 미저장 — 렌더 층에서 처리하거나 사전 확장.
- af 하루 쿼터는 75,000 (백필 당시 63,466 사용 중) — 소급 백필 1회 ~140콜 수준이라 부담 없음.
