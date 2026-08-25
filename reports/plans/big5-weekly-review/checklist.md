# 빅5 주간 리뷰 자동 발행 — 체크리스트

목표: 5대 리그 한 주(화요일 기준 지난 7일)가 끝나면 리그별 주간 리뷰 ANALYSIS 발행.
구성 = 주간 결과 요약 · 주간 MVP 선수(weekly-xi 재사용) · **주간 MVP 감독(신규)** · 이변.

- [x] `src/lib/soccer/weekly-review.ts` — 데이터 빌더 (경기+시장확률, 팀 주간 승점 vs 기대 승점, 감독 매핑)
- [x] `src/prompts/soccer-weekly-review.ts` — 프롬프트
- [x] `src/jobs/generate-soccer-weekly-review.ts` — 잡 (slug 멱등, 팩트 게이트, --dry)
- [x] package.json script `job:soccer-weekly`
- [x] cron route `/api/cron/soccer-weekly-review` + vercel.json (화 02:00 UTC = 11:00 KST) + CRON_REGISTRY
- [x] dry-run 으로 실데이터 검증 (EPL)
- [x] tsc + 실발행 1건 확인 후 push
