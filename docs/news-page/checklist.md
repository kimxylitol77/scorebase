# `/news` 해외 뉴스 게시판 — 체크리스트

## A. 소스 신뢰도 (화이트리스트 전환)
- [x] `ALLOWED_PUBLISHERS` 정규식 신설 — 통신사·공영방송·리그 공식·1급 전문지만
- [x] gnews `promote` 승격명이 화이트리스트 밖이면 항목 폐기 (폴백으로 기본 소스명 쓰지 않기)
- [x] `TABLOID_RE` 는 2중 방어로 유지
- [x] 검증: DRY 로그에서 MSN·TheHardTackle 류가 실제로 차단되는지 확인

## B. 종목 확장
- [x] `SourceDef.sport` 필드 추가 (소스가 종목 고정 — LLM 분류에 안 맡김)
- [x] 기존 축구 소스 전부 `sport: "soccer"` 명시
- [x] ESPN MLB/NBA/NHL RSS 3종 추가 (direct)
- [x] gnews `site:mlb.com` / `site:nba.com` / `site:nhl.com` 3종 추가 (리그 공식)
- [x] gnews 기자 2종 추가 — Jeff Passan(MLB) · Shams Charania(NBA)
- [x] `classify` 프롬프트 종목별 rubric 분기
- [x] `REWRITE_SYSTEM` 종목별 페르소나·표기 규칙 분기
- [x] `Post.sport` 에 실제 종목 기록 (현재 "soccer" 하드코딩 제거)
- [x] 루머 추출(`extractTransferRumors`)은 축구 TRANSFER 만 타도록 종목 게이트

## C. 발행 배분
- [x] 종목별 런 상한 (축구 2 · 타 종목 각 1)
- [x] `MAX_PUBLISH_PER_DAY` 12 → 16, `MAX_PUBLISH_PER_RUN` 3 → 5
- [x] 비시즌 종목은 억지 발행 없이 비우는지 확인 (MIN_SCORE 게이트 유지)

## D. 스키마
- [x] `NewsBriefing.sport` 컬럼 raw SQL ALTER (`db push` 금지 · `lock_timeout 3s`)
- [x] `prisma/schema.prisma` 에 필드 반영 + `prisma generate`

## E. `/news` 페이지
- [x] `src/app/news/page.tsx` — 목록 · 종목 필터 탭 · 소스 배지 · 페이지네이션
- [x] 메타(title·description·canonical·OG) + JSON-LD CollectionPage
- [x] `/analysis?board=briefing` → `/news` 308 리다이렉트
- [x] `BoardTabs` briefing href → `/news`
- [x] 헤더 nav-config 갱신
- [x] `/analysis/[id]` 브리핑 글 복귀 링크 → `/news`
- [x] sitemap 등록

## F. 검증
- [x] `npx tsc --noEmit`
- [x] `DRY=1 npm run job:news-briefing` — 종목별 후보 확인 · 화이트리스트 차단 확인
- [x] dev `/news` 실렌더 (데스크탑 + 모바일 1열)
- [x] 리다이렉트 실제 동작 확인
- [ ] 실발행 1회 육안 검수 (종목 배분 · 출처 표기 · 인용 1문장 준수)

## H. 과거 발행분 정리 (작업 중 발견)
- [x] 화이트리스트 밖 매체 발행분 규모 조사 — 478건 중 186건(39%)
- [x] `scripts/hide-nonwhitelist-briefings.mjs` — BRIEFING → BRIEFING_LEGACY (REVERT=1 로 되돌림)
- [x] 상세 페이지·board-move 가 LEGACY 도 취급하게 (안 하면 숨긴 글이 404 — 색인 손실)
- [x] 적용 186건 → 목록 292건, 숨긴 글 URL 200 확인

## G. 배포
- [x] prod DDL 적용
- [ ] commit (한국어 · 논리 단위 분할)
- [ ] push + Vercel 배포 검증
