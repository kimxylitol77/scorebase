# /scores/[league] 컨텍스트 노트

## 2026-10-01
- 조사 실측. /scores 는 3,446줄 단일 페이지(force-dynamic, cookies 3곳), 추출 가능한 view 컴포넌트 없음. /live/* 에는 리그 목록 페이지 없음(경기 상세만). /scores 는 lean sitemap 에 없고 /en/scores 만 있음. `?league=` 뷰는 generateMetadata 가 noindex.
- 결정 1. 리팩터링 대신 **새 라우트가 기존 ScoresPage 를 호출**. 근거 = 3,446줄 이동은 회귀 위험이 크고, 메타데이터는 라우트 단위라 새 라우트에서 덮어쓰면 noindex 규칙을 우회할 수 있다.
- 결정 2. URL 대문자(`/scores/EPL`). /leagues·/predictions·/live 와 동일 관례. 소문자 308 은 /live 규칙 복제.
- 결정 3. 칩 링크는 "기본 뷰에서만" 새 URL. 날짜 탐색 중 리그 클릭이 오늘로 튀는 UX 깨짐 방지.
- 결정 4. /scores 자체도 lean sitemap 에 추가. 왜 빠져 있었는지 기록 없음(5/23·6/20 청소 때 thin 대상은 아니었음) — 허브가 빠진 채 하위만 넣는 건 어색해 포함. 문제 생기면 이 줄만 되돌리면 됨.
- 함정 예상. ScoresPage 안의 BreadcrumbList/ItemList JSON-LD 는 /scores 기준 URL — 새 라우트에서는 FAQPage 만 추가하고 Breadcrumb 중복은 두지 않는다.
- 실측(10-01). /scores/EPL 200·제목·canonical·noindex 없음·FAQ 렌더, /scores/epl 308, /scores/XXX 404, sitemap /scores/{27}. 축구 리그 링크는 사이드바(SoccerLeagueSidebar.buildHref)가 만들고 항상 date·sort 를 달아서 처음 규칙(쿼리 있으면 유지)으로는 한 건도 새 URL 이 안 됐다 → "date==오늘(KST) && status 없음" 만 보고 sort 는 무시(쿠키로 유지)로 바꿔 허브에서 18개 리그 링크가 /scores/{CODE} 로 나감. 어제 날짜 뷰는 쿼리 유지 확인.
- 오늘 경기 있는 군소 리그(AFCON·CANADA_PL …)도 /scores/{CODE} 로 열리지만 INDEX_LEAGUES 밖이라 noindex — 사이트맵 27개와 일치.
