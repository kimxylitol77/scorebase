# 이적시장 데일리 — 컨텍스트 노트

작업 중 결정과 근거. 계속 덧붙임.

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
