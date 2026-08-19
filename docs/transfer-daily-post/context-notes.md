# 이적시장 데일리 — 컨텍스트 노트

작업 중 결정과 근거. 계속 덧붙임.

## 2026-07-14 예상 XI 웹 검색 전환

- **왜 시장가치 버킷을 버렸나** — 스쿼드 position 이 원천(TheSports squad/list)부터 G/D/M/F 4종뿐. 세부 포지션(윙/DM/AM/CB)이 없어 4-2-3-1 의 MF 슬롯 5개를 M 선수 시장가치순으로 채우면 중앙 자원만 몰리고 윙어 0인 기형 XI. post 991(맨유) 실측 후 삭제.
- **실제 lineup API 는 비시즌에 불가** — match/lineup/detail 은 x/y 좌표까지 주지만 "최근 30일" 제한. 7월엔 지난 시즌 경기가 30일 초과라 code=100003. DB 저장분(Match.lineupHome)은 좌표 없이 이름 배열뿐. → 사용자 지시로 웹 검색 채택.
- **웹 검색 XI** — generateWithWebSearch(Anthropic web_search 서버 도구)로 매체 예상 라인업 검색 → LLM 이 FORMATIONS 슬롯 id별 영문 풀네임 JSON 출력 → matchSquadPlayer(악센트제거+성 매칭)로 pid 확보. 슬롯 좌표는 FORMATIONS[formation] 사용.
- **모델 = haiku (sonnet 아님)** — sonnet-5 는 thinking 블록이 max_tokens 를 먹어 text 를 못 냄. haiku 는 end_turn 에 깔끔한 JSON. 검색 변동으로 형식 어긋날 수 있어 2회 재시도.
- **pause_turn 루프 필수** — web_search 는 서버 도구라 검색 왕복 중 stop_reason=pause_turn 으로 끊길 수 있음. 직전 content 이어붙여 재요청(최대 4턴). 없으면 "텍스트 블록 없음" 실패.
- **매칭 게이트 8/11** — 11명 중 실선수 매칭 8 미만이면 엉뚱한 팀/환각으로 보고 보드 생략(다이제스트만). 감독 캐릭·감독 데이터는 손 안 댐(캐릭은 실제 맨유 감독으로 확인, 오염 아님).
- **커스텀 이름 한계** — 스쿼드에 없는 선수(예: 갱신 전 신규 영입, 데이터 누락 선수)는 pid 없이 커스텀 이름(playerKo)으로 배치. 사진 없이 이름만. 음역 사전 미비 시 이상표기 가능(minor).
- **신규 영입 노출** — 웹 XI 주전이 아니면 벤치 최우선(single 보드만 벤치 표시). versus 보드는 벤치 없음.

## 2026-07-12 설계 결정

- **updatedAt 이 신규 판별 기준** — FootballTransfer 에 createdAt 없음. updatedAt 은 @default(now())+upsert 미갱신이라 사실상 first-seen(소식일). transferTime(발효일)은 7/1 시즌 전환 무더기·미래 임대복귀 때문에 recency 로 못 씀 (transfers/page.tsx:215 주석과 동일 결론).
- **ts team id 직결** — FootballTransfer.toTeamId, team-squads.json, team-coaches.json 모두 ts team id 키라 TeamSourceId 매핑 없이 직접 join.
- **주목 필터 임계 €3M** — 어제 실측 24h 19건 중 fee>0 2건·aiBrief 3건. K리그·MLS 자유이적 소음 차단하면서 빅리그 대어 자유계약(fee 0)은 시장가치로 구제.
- **포커스 팀 필수 조건 = 스쿼드 데이터 존재** — team-squads.json 154팀에 없으면 보드를 못 만들므로 다음 순위 팀으로 폴백. 전부 없으면 다이제스트만 발행.
- **맞대결 임계** — 상위 2팀 모두 가중치(이적료+시장가치 합) €10M 이상이면 versus 보드. 아니면 단일 보드.
- **Post.lineupCode 는 1개** — versus 성립 시 versus 보드가 그 1개를 차지(두 팀 XI 를 한 보드에 표시).
- **제목은 코드가 결정** — "[이적시장 데일리] M월 D일 — {팀Ko}, {선수Ko} 영입 외 N건". LLM 은 본문만(제목 창작 금지). 하루 1개 가드도 이 prefix 로 검사(post-daily-topic 패턴).
- **게이트 TRANSFER_DAILY_ENABLED** — 기본 OFF. LLM 하루 1회(haiku)라 저비용이지만 과금 게이트 원칙(feedback_deploy_gate_cost) 준수. cron-registry 워치독에는 게이트 ON 확인 후에 등록(OFF 상태로 등록하면 미실행 알림 소음).
- **선수 한글명** — 본문 텍스트는 toKoreanPlayerName(사전) 폴백 영문. 보드는 pid 만 저장하고 /lineup 렌더가 pool 에서 한글화하므로 불필요.
- **조사 워크플로우 실패 2건 메모** — postInfra·marketValue 에이전트가 StructuredOutput 실패했으나 직접 grep 으로 보완 완료. 이적 데이터·자동발행 패턴 조사는 성공(요약: FootballTransfer 6h 수집, jobs+cron route+vercel.json 3층, generate() haiku+OpenAI 폴백, GENERATE_DISABLED 킬스위치 존재).

## 2026-07-12 versus 좌표 버그 (post 938 초판)

- encodeBoard 는 좌표를 그대로 저장하고 Pitch 도 그대로 그린다 — **versus 배치는 빌더가 좌표를 미리 변환**해서 만드는 것(LineupBuilder placeY). 홈=50+0.46y(아래 절반), 원정=50-0.46y(위 절반 미러), x 는 그대로.
- 잡이 풀피치 좌표로 두 팀을 넣어 22명이 겹침 → vY 변환 추가로 해결, post 938 lineupCode 교체 완료. 단일 보드는 변환 불필요(풀피치가 맞음).
- dryRun 은 하루 1개 가드를 통과하도록 수정(미리보기 용도).
- 신규 영입 선수는 /lineup pool 에 사진이 없으면 이니셜 칩으로 표시(휼만드) — 정상 동작.
