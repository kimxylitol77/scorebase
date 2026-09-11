# 체크리스트
- [x] `src/jobs/link-betman-matches.ts` — TEAM_MAP + 킥오프 ±3h 로 matchId 채움(멱등)
- [x] `/api/cron/betman-link` (01:00·13:00 UTC, 워커 1h 뒤) + vercel.json + CRON_REGISTRY
- [x] `betman.ts` — getBetmanLineForMatch: matchId 우선·SC 전용 필터 제거(야구 사전 있는데 안 쓰이던 버그)·matchSeq 반환
- [x] BetmanLineCard — 경기번호·마진 대비 줄 / BetmanOddsPanel — #경기번호
- [x] `src/lib/predict/odds-band-stats.ts` + 적중률 페이지 섹션
- [x] tsc → 매핑 잡 실행(prod) → 매핑률 확인 → dev 렌더(상세 카드·/odds·accuracy)
- [x] 커밋 3건(매핑 잡 / 카드·패널 / 적중률)·push
