# 축구 선수 빙 SEO — 컨텍스트 노트 (2026-08-08)

## 진단 (실측)
- fc81896(오늘 오전)의 `/players/[pid]` 축구 제목은 **ts 매핑 없는 소수에게만 실효** — 매핑 3,455명은 [players/[pid]/page.tsx:214](../../src/app/players/[pid]/page.tsx) 에서 `/transfers/{tsId}` 로 redirect.
- `/transfers/{id}` production 제목 실측: `손흥민 시장가치 €15M · 몸값 추이` — 몸값 검색어만 커버, "{선수} 프로필/성적/골" 미커버.
- sitemap 실측: 총 5,238 URL 중 `/transfers/` 600건(빅5 몸값 상위 600 한정). **손흥민(MLS) 0건**. DB에는 리그 판명+몸값 보유 선수 4,094명(EPL 803·SERIE_A 919·LALIGA 705·LIGUE_1 688·BUNDESLIGA 684·MLS 184·SAUDI_PL 91·K_LEAGUE_1 20). league null 9,758명은 thin 위험으로 제외 유지.
- IndexNow cron 은 Article·Blog 만 제출. PlayerMarketValue.updatedAt 는 값이 실제 바뀔 때만 갱신(26h 0건·7일 7건 실측) → 선수 URL 추가해도 스팸성 재제출 없음.

## 결정
1. **제목 패턴**: `{이름} 프로필 — {팀} {포지션} · 시즌 {골}골 {도움}도움 · 몸값 €{val}M`. 몸값 검색 노출은 뒤에 유지하고 앞자리를 수요 큰 프로필·성적 검색어에 배정(사용자 승인). mv 없는 라이트 프로필은 몸값 조각 없이 동일 패턴.
2. **메타 데이터 소스**: generateMetadata 에서 DB·API 추가 호출 금지 — 모듈 스코프 정적 JSON(SEASON=player-season-stats.json, DETAIL_POS, OVERRIDES) + loadPlayer 기존 결과만 재사용. af 쿼터 사고(3ea74b7) 계열 재발 방지.
3. **포지션**: 본문과 동일 우선순위 — DETAIL_POS(라인업 좌표 기반) → tsp.position. 이를 위해 본문 내부에 있던 DETAIL_COARSE 를 모듈 스코프로 승격(설영우 헤더/소개문 어긋남 실측과 같은 이유).
4. **sitemap**: `league not null + currentValue not null`, 몸값 내림차순 take 5000(안전 상한). GOOGLE_NOINDEX 는 그대로 — 구글에만 제외, 빙은 색인(seo-robots.ts 설계 의도 그대로).
5. **IndexNow**: 기존 26h 창 재사용, `/transfers/{id}` 만 추가. 응답에 players 카운트 노출.

## 함정 메모
- generateStaticParams+revalidate 300 ISR — 제목 변경은 배포 후 최초 요청부터 반영, 캐시 무효화 불필요(페이지 캐시는 배포마다 리셋, unstable_cache 아님).
- 병렬 세션 미커밋 파일 존재(pages-inventory.json, docs/*) — 내 파일만 add.
