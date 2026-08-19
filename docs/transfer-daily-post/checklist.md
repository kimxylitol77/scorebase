# 이적시장 데일리 — 체크리스트

## 2026-07-14 — 예상 XI 웹 검색 기반 전환 (말도 안되는 라인업 수정)
배경: 세부 포지션 데이터(윙/DM/AM)가 원천에 없어(G/D/M/F뿐) 시장가치 버킷이 중앙 자원만 몰아 윙 없는 기형 XI 발행(post 991 삭제). 실제 lineup API는 30일 제한+비시즌 무경기로 불가. → 웹 검색으로 매체 예상 XI를 얻어 배치.

- [x] `src/lib/ai/claude.ts` — `generateWithWebSearch` 추가 (pause_turn 루프 포함)
- [x] `generate-transfer-daily.ts` — `buildSquadSideFromWeb` 로 교체 (haiku + 2회 재시도)
- [x] 웹 XI 이름 → 스쿼드 pid 매칭 (matchSquadPlayer, 실패 시 커스텀 이름)
- [x] 신규 영입 벤치 우선 노출 (single 보드) + versus 판정 rival 보드 성공 기준
- [x] 매칭 8/11 미만·검색 실패 시 보드 생략 (다이제스트만)
- [x] tsc 통과 + dry-run 맨유·라이프치히 versus 검증 (진짜 4-2-3-1 확인)

## 초판 (완료분)

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
