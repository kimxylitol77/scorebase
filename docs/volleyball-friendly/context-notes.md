# 배구 친선 온보딩 — 컨텍스트 노트

작업 중 내린 결정과 근거. (2026-08-16)

## 리그 코드 = VB_FRIENDLY / VB_FRIENDLY_W

축구에 이미 `INTL_FRIENDLY` 가 있어 배구는 sport 접두로 구분. 표시명은 "배구 국가대표 친선 (남/여)".

## 팀은 기존 row 재사용 — 새 Team 은 네덜란드(남) 하나만

친선 6팀 중 5팀은 VNL/VNL_W/EGL_W 시드에 이미 존재 (Belgium 608993, Netherlands W 610760, Bulgaria W 610774, Spain W 608957, Hungary W 608965). 같은 팀을 친선 리그로 중복 생성하면 Elo(팀 id 키)·로고·한글명이 갈라지므로 **기존 Team id 에 TeamSourceId(league=VB_FRIENDLY*)만 추가**. 네덜란드(남 `kn54qldholorvy9`)만 어느 리그에도 없어 신규 생성 (league=VB_FRIENDLY).

## 왜 TeamSourceId 를 친선 리그로 또 넣나

`thesports-matches` route 의 팀 해석이 **매치의 league 기준** — dbMap(`league|tsId`) → JSON byLeague → JSON unambiguous 순. VNL_W 매핑만으로는 VB_FRIENDLY_W 매치가 앞 두 단계를 빗나가고, 셋째(unambiguous)는 src JSON 사본 드리프트(56 vs 74건 — Netherlands W 누락 실측)에 취약. DB + JSON 양쪽에 친선 리그 키를 명시해 결정론적으로 만든다.

## src JSON 사본은 lightsail 사본과 동기화

route 가 읽는 `src/lib/sports/thesports/volleyball-team-id-mapping.json` 이 lightsail 사본보다 18건 뒤처져 있었다(VNL_W 추가분 미반영 — DB 가 커버해 실해는 없었음). 친선은 임의 국대가 계속 등장해 unambiguous fallback 이 실제로 쓰이는 첫 케이스라, 이번에 두 사본을 맞춘다.

## 미매핑 국대가 나오면

collector 는 워커 로컬 JSON 의 tsId 집합에 없는 팀 매치를 skip (조용히). 새 국가가 친선에 나오면 diary 팀 id → team/list 로 이름 확인 → JSON 두 사본 + TeamSourceId 추가. 이번 등록분은 8/16~17 확인된 3경기 6팀.

## 안 한 것

- 순위표 — 친선은 standings 없음. [순위] 칩은 standings 캐시 부재 시 원래 안 뜸.
- Elo 시드 — 팀 재사용이라 VNL 레이팅을 그대로 승계. VB_FRIENDLY 전용 시드 불필요.
- 하키 클럽 친선 — 유럽 클럽 수십 팀 매핑이 선행돼야 해 별건 (ts utid `j1l4rj1bv30r7vx`, 커버리지 6~7할 실측).

## 2차 — 대륙·연령별 선수권 (2026-08-16)

### 대회명은 반드시 7m 날짜별 화면으로 확인

ts 는 `competition/list`·`additional` 이 미인가라 대회 이름을 주지 않는다. utid 만으로는 정체를 알 수 없어 `team/list?uuid=` 로 참가팀을 풀고, 그 조합을 7m 의 해당 날짜 화면과 대조해 이름을 확정했다. 9개 중 7개가 이렇게 확인됐고, 확인 못 한 2개는 등록하지 않았다(아래).

### 순위 폴백이 토너먼트에 리그 순위를 만든다

`volleyball-table.ts` 는 캐시 miss/stale 시 **DB 종료 경기로 순위를 자체계산**한다. 신규 대회를 `standings-poller` 의 `VOLLEYBALL_SEASONS` 에 등록하기 전에는 카드 [순위]가 이 계산값이었다(U17 세계선수권 대한민국 [3] 등 — 조별 순위가 아닌 임의값). **리그 코드만 넣고 끝내면 조용히 틀린 순위가 노출된다.** season_id 는 diary row 의 `season_id` 로 얻고, 등록 전 `season/table/detail?uuid=` 가 code=0 인지 반드시 확인할 것(7개 모두 조별 2~8테이블 제공).

### 정기 sweep 범위 밖은 backfill 로

collector 는 -3~+5일만 돈다. 이미 진행 중이던 대회의 과거 경기와 +5일 밖 일정은 `node volleyball-collector.js --backfill=N` 일회 실행으로 채운다(이번엔 16일, 251건).

### 미등록으로 남긴 3개

이름을 확인하지 못해 제외했다. 등록하려면 7m 해당 날짜 화면 대조가 먼저.
- `y39mpwh3zg2qojx` — 아메리카 여자 8팀, 8/3~8/7 종료, 10경기
- `jw2r0nhlo1xqz84` — 동남아 여자 4팀, 8/8, 2경기
- `jw2r0nhldw7qz84` — 필리핀 클럽 여자 4팀(PLDT·Creamline 등), 8/8·8/22
