# PlayerEvent 컨텍스트 노트

> 작업 중 내린 결정과 근거. 세션이 바뀌어도 여기부터 읽으면 이어갈 수 있게 계속 덧붙인다.

## 2026-07-14 — 기획 확정

- **발단**: 산투스 첼시→맨유 이적이 페이지에 늦게 반영된 사건(커리어 정적 JSON + mv 피드 지연).
  사용자가 "나무위키처럼 매주 업데이트"를 요청 → 사람 편집이 아니라 데이터 추출 자동화로 방향.
- **LLM 창작 배제 근거**: 5월 GSC 노출 폭락(3195→22)이 대량 자동생성 콘텐츠 의심이었음.
  데이터 조립형 문장(TeamAbout 패턴)은 안전 판정. 비용도 수백 명 규모에선 LLM 불가.
- **사건 범위 = 경기 관련만** (사용자 확정): 경기 외적 사건사고는 뉴스 소스 부재 → LLM 추측
  + 명예훼손 리스크. 나무위키와의 차별점은 "데이터 검증된 사건만"으로 잡는다.
- **대상 = mv 보유 선수 전체** (사용자 확정): 규칙 기반이라 비용 차이 없음. 포커스 75명
  한정은 Phase 3 LLM 요약에서만.
- **배포 = 완성 후 일괄** (사용자 확정): 평소 큰 변경 한 번에 push 패턴과 동일.

## 설계 결정

- **이벤트를 테이블로 쌓는 이유**: 부상·라인업은 피드에서 사라짐. 실시간 계산으로는
  "과거 주차 기록 보존"이 불가능. PlayerEvent 자체가 스냅샷 역할.
- **dedupeKey 멱등**: cron 재실행·백필 중복 방지. 소스별 자연키 조합
  (transfer:{playerId}:{transferTime} 등).
- **playerId = TheSports player id** (PlayerMarketValue.id와 동일 키). 이적시장 페이지 체계 준수.
- **부상 감지 방식**: 매주 현재 부상 명단 스냅샷을 기존 미해제 INJURY 이벤트와 비교.
  명단에서 사라지면 RETURN 이벤트 생성. (직전 상태 저장용 별도 테이블 불필요 —
  PlayerEvent가 그 역할.)
- **UI 위치 = 개요 탭 최상단**: 근황은 방문자가 가장 먼저 찾는 정보. 이벤트 0건이면 섹션 숨김.

## 재사용할 기존 자산

- 이적 이벤트 문장: transfers 페이지 표기(transfer-display.ts의 koTeam/badgeOf) 재사용.
- 부상 데이터: /injuries 페이지의 af fetch + TheSports lineup.injury 경로.
- 국대 감지(P2): /transfers/[id]의 PLAYER_TO_NATL_TSID 역검색 패턴.
- 밀스톤(P2): 매치 캐시 playerStats — 국대 경기 기록 섹션에서 파싱 패턴 이미 있음.

## 2026-07-14 — 부상 소스 = TheSports (사용자 지적으로 정정)

- **처음 오판**: 부상을 api-football 리그별 fetch + ts↔af 선수 id 퍼지 매칭으로 보고
  Phase 2로 미루려 함. → 사용자 "부상자 TheSports 이쪽이 더 정확하지 않어?" 지적.
- **정정**: 부상 primary = TheSports (우리 원칙 + /injuries 이미 사용). 데이터 위치 =
  `theSportsMatchCache.lineup.injury.{home,away}[]` (매치 lineup 캐시).
- **핵심**: injury entry가 **ts player id(`x.id`)로 식별** → PlayerMarketValue.id·
  PlayerEvent.playerId와 동일 키. **퍼지 매칭 불필요.** 이게 api-football 대비 결정적 이점.
- **TSInjEntry 필드**: id(ts player id)·name·reason·start_time(부상 시작)·end_time(0=진행중,
  값 있으면 복귀 시각)·missed_matches·position.
- **이벤트 추출(결정적)**:
  - INJURY @ start_time, dedupeKey `injury:{playerId}:{start_time}`
  - end_time>0 이면 RETURN @ end_time, dedupeKey `return:{playerId}:{start_time}`
- **멱등**: 같은 부상이 여러 매치 lineup에 반복 등장하지만 start_time 동일 → dedupeKey 동일 → 중복 0.
- **스캔 범위**: 최근 매치 lineup 캐시(부상은 진행 중일 때만 lineup에 남음). 지금부터 스냅샷
  쌓기 시작 = "역사 보존" 의도와 일치. 과거 종료 부상은 backfill 불가(정상, 앞으로만 쌓임).
- **재사용**: `getTheSportsInjuriesByTeam` 로직 참고([src/lib/sports/thesports/injuries.ts:147]).
  단 그건 "팀별 현재 부상"이고, 우리는 "이벤트 추출"이라 lineup.injury를 직접 순회.

## 함정 (메모리에서)

- db push 백그라운드 hang → 전면 500 사고. CREATE TABLE도 pg_dump(04:30 KST) 회피 후 직접 SQL.
- Write로 신규 파일 만들기 전 ls로 존재 확인 (/api/me 덮어쓰기 사고).
- 공유 워킹트리 — commit은 이 작업 파일만 명시적 add.
- prisma 신규 컬럼 NOT NULL이면 @default 필수.
