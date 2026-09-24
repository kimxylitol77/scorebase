# 일정 누락 전수 대조 — 컨텍스트 노트

## 결정과 근거
- **권위 소스로 af `fixtures?date=` 사용.** 하루치 전 세계 경기를 1콜로 준다 → 22일 = 22콜로 축구 142리그를 덮음(Ultra 75k/일). 리그별 시즌 조회보다 싸고, ts 수집 리그도 독립 소스로 검증된다.
- **매칭은 3단.** ①externalId=af fixture id ②TeamSourceId(api-football)/Team.externalId 로 양팀 일치(±36h) ③같은 리그 ±3h 안에 한 팀이 확정 일치(한 팀이 3시간 안에 두 경기 불가). 이름 부분문자열 매칭은 "Los Angeles" ⊂ "LA Galaxy" 류 오탐이 있어 단어 겹침으로 바꿈.
- **"신규 팀" 판정을 그대로 믿지 않는다.** backfill:cup-teams dry-run 이 Hajduk·Hammarby 등 af 수집 리그의 기존 팀을 신규로 판정(ts 매핑이 없고 이름이 정확히 안 맞음) → 그대로 쓰면 팀 행 중복. 또 Al-Ittihad 를 EGYPT_PL 팀에 이름 재사용하려 했음(실제는 SAUDI_PL). → **같은 킥오프 경기로 ts↔af 팀을 짝지어** af id 로 기존 행을 찾는 브리지(scripts/tmp/bridge.ts)로 확정.
- **CHILE_PD 는 af 수집 리그**(창 안 행 전부 숫자 id) — ts 매핑을 만들면 크로스소스 중복. cup-teams 대상에서 제외.
- **VIETNAM_VL1 은 누락이 아니라 오매핑.** team-id-mapping.json 의 audit-auto 항목이 Cong An Ha Noi 를 Ha Noi(#290184)로 연결 → CAND 경기가 Ha Noi 경기로 기록(9/05 Ha Noi 하루 2경기). af 브리지 9경기 전부 16400(CAND)을 가리킴.
- **0건 리그 12개는 설계.** 19859b0d·b5893312 가 /scores af orphan 카드 전용으로 등록, DB 수집은 "별도 PR" 로 남겨둠. 온보딩은 PREVIEW LLM 비용·감시·예측이 따라오므로 사용자 결정.

## 함정
- 브랜치 전환 뒤 prisma generate 필수 — 이 워크트리 원 브랜치는 MatchVote 스키마가 main 보다 오래됨.
- dup-cleanup 탐지기 4종은 모두 동방향/같은 tsMatchId 만 묶음 → 역방향 스플릿 스쿼드 짝은 안전.

## 2차 발견 (af 대조 이후)
- **CHILE_PD "누락" 1건의 실체는 POSTPONED 고착.** af#1505509 는 8/31 중단(0-1) → 9/16 재개 종료. ts 는 아직 8/31 상태 10. CHILE_PD 는 TS_COVERED 라 운영 collect 가 건너뛰어 af 정답이 안 들어옴(로컬 collect 로는 정상 교정됨을 재현).
- **같은 유형 전수: POSTPONED af 축구 행 123건 중 af 종료 65·재편성 NS 25.** 대부분 ts 마지막 상태 9(지연) — ts 는 지금 전부 8(종료)·점수 일치. 경로: thesports-cache 가 mapFootballStatus(sid) 를 킥오프 없이 호출 → 9·10 이 "킥오프 후 무한대"로 즉시 POSTPONED → POSTPONED 행은 푸시 무시 → TS_COVERED 라 collect 없음 → stale-ts-verify 는 SCHEDULED·LIVE 만 → 영구 고착.
- **수정은 두 겹.** ① 킥오프 전달(원인) ② cleanup-stale-scheduled 에 POSTPONED af 행 af 재확인(ts 가 재개 경기를 못 따라가는 CHILE 유형까지 덮는 안전망). raw 로 af 출처 확정(ESPN 6자리 id 오조회 방지), 쌍둥이는 기존 흡수, 한 팀이라도 ±3h 겹치면 보류(팀 행이 갈린 중복 방지).
- **로컬 일괄 복구는 흡수 없이 보류만.** 흡수(행 삭제·종속 이전)는 배포된 cron 의 검증된 경로에 맡김.
- 하키 친선 누락 40건 = 매핑 없는 하부 클럽. 정규 리그 누락은 전부 수집 sweep(±5일) 밖 미래 경기라 정상.
