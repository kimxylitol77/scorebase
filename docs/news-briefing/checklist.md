# 해외 축구 브리핑 — 체크리스트

## 구현

- [x] prisma/schema.prisma — NewsBriefing 모델 추가 (+storyKey)
- [x] scripts/create-news-briefing-table.mjs — prod raw SQL (lock_timeout 3s, db push 금지)
- [x] src/lib/ai/claude.ts — GenerateOptions.model 추가 (model 지정 시 temperature 미전송)
- [x] src/jobs/fetch-news-briefing.ts — 수집→분류→재작성→검증→발행 파이프라인
- [x] src/app/api/cron/news-briefing/route.ts — CRON_SECRET 인증 + recordCronRun
- [x] vercel.json — cron 추가 (20 */2 * * * — 2시간 간격)
- [x] src/lib/cron-registry.ts — news-briefing 등록 (maxAgeH 6)
- [x] src/app/analysis/page.tsx — 세 번째 보드 탭 "해외 브리핑" (?board=briefing)
- [x] src/app/analysis/[id]/page.tsx — 해외 브리핑 배지 + 목록 복귀 링크
- [x] src/components/nav-config.ts — 커뮤니티 메뉴에 해외 브리핑 항목
- [x] src/app/api/admin/briefing-hide/route.ts — 오보 원클릭 숨김 (텔레그램 링크용)
- [x] package.json — job:news-briefing 스크립트

## 검증 (2026-07-04 완료)

- [x] Sky Sports RSS = 11095 (Football News) 확인 — 12040 은 종합 뉴스
- [x] npx tsc --noEmit 통과
- [x] prod DDL 적용 (CREATE TABLE + storyKey ALTER)
- [x] DRY 실행 3회 — 검증 게이트가 날조 재작성 2건 실제 차단 확인 (설계 의도대로)
- [x] 실발행 3건 (post 639·640·641) — 목록·상세·배지·출처 링크·텔레그램 확인
- [x] 숨김 엔드포인트 — 정상 호출 HIDDEN 전환, 시크릿 없으면 401
- [x] dev 서버 스크린샷 검수 (모바일 스냅샷 + 데스크탑)

## 배포

- [ ] push HEAD:main (사용자 확인 후) + Vercel 배포 검증
- [ ] Vercel env 확인 — ANTHROPIC_API_KEY·TELEGRAM_*·ADMIN_SECRET·SITE_URL 기존 등록 (신규 env 없음, BRIEFING_MODEL 은 선택)
- [ ] 첫 자동 발행 모니터링 (텔레그램) — 초기 1주 오분류 패턴 관찰
