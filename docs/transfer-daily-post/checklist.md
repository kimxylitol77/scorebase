# 이적시장 데일리 — 체크리스트

- [ ] `src/jobs/generate-transfer-daily.ts` — 24h 주목 이적 선정 + 팀 그룹핑
- [ ] 포커스 팀 선정(가중치) + 스쿼드 가치 집계(XI 합·톱3)
- [ ] 예상 XI 빌드(감독 선호 포메이션, 시장가치 상위, 벤치 5) + `encodeBoard` 단일 보드
- [ ] 맞대결 조건(2팀 임계 이상) 시 versus 보드로 전환
- [ ] LLM 본문 생성(generate, 사실 고정 프롬프트) + 제목은 코드에서 결정적으로
- [ ] 발행: 분석팀 계정·category FREE·lineupCode·하루 1개 가드
- [ ] `src/app/api/cron/transfer-daily/route.ts` — 인증 + TRANSFER_DAILY_ENABLED 게이트
- [ ] `vercel.json` cron `0 0 * * *` 추가
- [ ] tsc 통과
- [ ] 수동 실행 검증(게이트 ON 로컬, 실제 발행 1회 후 확인·필요 시 삭제)
- [ ] 배포 + 사용자 Vercel env `TRANSFER_DAILY_ENABLED=1` 설정 안내
