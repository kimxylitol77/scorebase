# AI 픽 발행 게이트 3종 체크리스트 (2026-07-19)

목표. 백테스트로 확인된 "승률 깎아먹는 픽 유형"을 발행에서 제외해 게시 승률을 올린다.
근거 백테스트 = AiPrediction 채점 4,062건 (06-27~07-17). 상세 수치는 context-notes.md.

- [x] 1. src/lib/predict/publish-gate.ts 신규 — shouldPublishPick() 규칙 3종 + env 킬스위치(PREDICTION_PUBLISH_GATES=off)
  - 1X2: 시장 우세와 반대 픽 && prob<0.60 → 미발행 (6/7 모델 +1~7%p)
  - HANDICAP: 야구 && line>=1 && pick=HOME(-1.5 커버) → 미발행 (합산 64.6→68.4%)
  - OU: scorebase 외 모델 → 미발행 (타 모델 44~48% = 코인토스 이하)
- [x] 2. 설계 변경 — 픽 미저장이 아니라 **published=false 저장** (LLM 재호출 루프·선택 편향 방지, 채점은 유지해 게이트 유효성 계속 측정)
- [x] 3. AiPrediction.published 컬럼 스키마 추가 + gatedUpsert 로 storeAnchor/storePanel/backfill 3관문 통일 (qwen 맥미니 경로는 storePanel 경유라 자동 커버)
- [x] 4. 소비처 5곳 published:true 필터 — scorecard·AiConsensusWidget·AiRoundTableStrip·HomeAiScorecardShowcase·AiBenchmark. 채점·postmortem·qwen 라인 앵커는 전 행 유지(의도)
- [x] 5. 게이트 단위 검증 10케이스 전 통과 + tsc 통과
- [ ] 6. **프로덕션 ALTER (사용자 Neon SQL, 배포 전 필수)** — `ALTER TABLE "AiPrediction" ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT true;`
- [ ] 7. ALTER 확인 후 push·배포 + 다음 cron 실행 로그에서 [gate] 미발행 라인 확인
