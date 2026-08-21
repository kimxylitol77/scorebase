# 오버/언더 통계 — 체크리스트

- [x] 1. 집계 라이브러리 `src/lib/stats/over-under.ts`
      → 검증: 분데스리가 뮌헨 94.1%(34경기 중 32회)가 그대로 나오는지 대조
- [x] 2. 리그 상세 페이지 `/over-under/[league]`
      → 검증: 프로덕션에서 BUNDESLIGA·BUNDESLIGA_2·K_LEAGUE_2 200 응답 + 표 렌더
- [x] 3. 허브 페이지 `/over-under` (리그 랭킹)
      → 검증: 리그 수가 집계 기준과 일치하는지
- [x] 4. SEO — 메타·JSON-LD·sitemap 등재
      → 검증: 배포 후 sitemap 에 리그 수만큼 URL 포함
- [x] 5. 블로그 허브 글 발행 + 주 1회 갱신 cron
      → 검증: 발행 200 + cron 등록 확인
- [x] 6. IndexNow 제출 — 기존 일일 cron(/api/cron/indexnow)이 26h 내 갱신 Blog 를 자동 제출한다
