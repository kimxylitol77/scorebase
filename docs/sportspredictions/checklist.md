# sportspredictions.live 체크리스트

범례. `[x]` 완료 · `[~]` 막힘(사유) · `[ ]` 할 일

## Phase 0. 준비
- [x] 도메인 점검 (WHOIS·DNS·Wayback·블랙리스트·세이프브라우징) — 09-19
- [x] plan.md / checklist.md / context-notes.md 작성
- [ ] (사용자) Namecheap 포워딩 해제, DNS A 76.76.21.21 + CNAME www → cname.vercel-dns.com
- [ ] (사용자) Vercel 프로젝트에 sportspredictions.live + www 추가
- [ ] (사용자) Google Search Console 도메인 속성 추가 (DNS TXT)
- [ ] (사용자) Bing Webmaster 추가 (GSC 가져오기)

## Phase 1. 라우팅 골격
- [x] `src/middleware.ts` SP_HOSTS 상수 + isSp 판정
- [x] sp 호스트: `/robots.txt`, `/sitemap.xml` → `/sp/robots.txt`, `/sp/sitemap.xml` rewrite
- [x] sp 호스트: 옛 URL 410 (`/20\d\d/`, `/page/`, `/vip-betting-tips`, `/mega-combo-tips`, `/premium-tipsters`, `/refund-policy`, `/terms-and-conditions`, `/privacy-policy`, `/wp-*`, `/feed`, `/category/`, `/tag/`, `/author/`)
- [x] sp 호스트: 나머지 → `/sp{path}` rewrite (URL 유지)
- [x] scorebase.kr 등 다른 호스트에서 `/sp/*` 직접 접근 → 404
- [x] sp 호스트는 X-Robots-Tag noindex 분기(L152)에서 제외 확인
- [x] `src/lib/sp/site.ts` (SP_URL, spUrl)
- [x] `src/app/sp/layout.tsx` 빈 껍데기 + `/sp/page.tsx` "hello" → 검증 curl 3종

## Phase 2. 디자인 토큰·크롬
- [x] `src/app/sp/sp.css` 토큰 (plan §5 표, 항상 다크), 컴포넌트 raw hex 0건
- [x] layout.tsx 인라인 스크립트: sp 호스트 강제 dark (predictify 스타일로 변경)
- [x] Sora + Plus Jakarta Sans + JetBrains Mono next/font (sp layout 한정), 숫자 tabular-nums
- [x] `src/components/sp/SpHeader.tsx` (로고 텍스트 · Predictions · Accuracy · Methodology · About)
- [x] `src/components/sp/SpFooter.tsx` ("Data by Scorebase" 링크, 18+ 문구 없음, 도박 유도 문구 없음)
- [x] SiteChromeHeader/Footer/EmbedHidden: useSelectedLayoutSegment()==="sp" 면 null (SSR 정확)
- [x] 검증: `grep -rP '[가-힣]' src/app/sp src/components/sp` = 0

## Phase 3. 페이지
- [x] `ProbBar` (3분할, 라벨 병기) · `MatchPredCard` · `LeagueChips` · `ModelTable` 컴포넌트
- [x] `/` 오늘·내일 예측 (EN_PREDICTION_LEAGUES 13개, 발행 게이트 통과분만)
- [x] `/[league]` 리그별 예측 + 최근 30경기 적중률
- [x] `/match/[id]` 1X2·O/U·핸디캡·시장 갭·7모델 픽(published=true) · 스코어베이스 /en 딥링크
- [x] `/accuracy` 리더보드(7모델) + 리그별 표 (신뢰도 곡선은 보류)
- [x] `/methodology` 정적
- [x] `/about` 정적
- [x] 404 페이지 (sp 전용, 영어)
- [ ] 모바일 375px 확인(가로 스크롤 0), 터치 타깃 44px

## Phase 4. SEO
- [x] 페이지별 metadata: title·description·canonical(spUrl)·OG
- [x] JSON-LD: WebSite+Organization(/), SportsEvent(/match), Dataset(/accuracy)
- [x] `/sp/robots.txt` route handler (Allow all, Sitemap: https://sportspredictions.live/sitemap.xml, AI 크롤러 허용)
- [x] `/sp/sitemap.xml` route handler (/, 리그 13, accuracy, methodology, about, 최근 7일 match)
- [ ] 기존 `src/app/sitemap.ts`·`robots.ts` 에 sp 경로 미포함 확인
- [ ] Rich Results Test 통과

## Phase 5. 배포·검증
- [ ] `npx tsc --noEmit`
- [ ] 프로덕션 curl: 홈 200 / 옛 URL 410 / robots·sitemap 호스트 확인 / scorebase.kr/sp 404
- [ ] Lighthouse 모바일 접근성 ≥ 90
- [ ] GSC URL 검사 → 색인 요청 (홈·accuracy)
- [ ] ROADMAP.md 항목 추가

## Phase 6. 사후 (배포 후 1~4주)
- [ ] GSC 링크 리포트에서 백링크 확인 → 도박·스팸 도메인 disavow
- [ ] GSC 커버리지: 옛 URL "410" 처리 확인
- [ ] 30일 노출·클릭 기록 → context-notes
