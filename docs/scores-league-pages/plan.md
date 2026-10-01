# /scores/[league] — 리그별 라이브스코어 페이지 (한국어판)

작성 2026-10-01. 목표 = "{리그} 라이브스코어" 롱테일(EPL 라이브스코어·KBO 라이브스코어·해외축구 라이브스코어 …) 색인.

## 왜
- 지금 `/scores`는 종목 탭·리그 칩이 전부 쿼리(`?sport=&league=`)라 구글 눈엔 페이지 1장. 리그 필터 URL은 의도적으로 noindex.
- "라이브스코어" 헤드는 livescore.co.kr·네이버가 잡고 있어 정면 승부 불가. 리그명 결합 롱테일은 경쟁 약하고 합산 검색량이 큼.
- 영어판(sportspredictions.live /live-scores/{league})을 10-01 먼저 적용. 한국어판은 같은 구조를 기존 /scores 위에 얹는다.

## 설계 (최소 침습)
- `/scores/{CODE}` (대문자, /leagues·/predictions 와 같은 관례). 소문자는 미들웨어 308.
- 새 라우트는 **기존 `ScoresPage` 컴포넌트를 `searchParams={sport, league}` 고정으로 호출**한다. 3,446줄 페이지를 옮기지 않는다. 메타데이터는 새 라우트의 `generateMetadata`가 덮어쓰므로 기존의 "league 필터 = noindex" 규칙에 안 걸린다.
- 새 라우트가 더하는 것 = 제목·설명·canonical(자기 자신)·키워드, 리그 소개 문단, FAQ 3 + FAQPage JSON-LD.
- 대상 리그 = `SITEMAP_LEAGUES`(27개, 한국 검색수요 있는 핵심). 그 외 코드는 라우트가 열리되 noindex.
- 칩·드롭다운의 리그 링크 = 기본 뷰(오늘·필터 없음)에서는 `/scores/{CODE}`, 날짜·상태·정렬이 걸린 뷰에서는 기존 쿼리 유지.
- 사이트맵(lean) = `/scores` + `/scores/{27}` hourly.
- 렌더 = force-dynamic(기존과 동일, cookies 사용). 데이터 캐시는 기존 unstable_cache 그대로.

## 하지 않는 것
- /scores 본문 리팩터링. /en/scores 변경. /leagues/{리그}(순위·주간 일정) 와 역할 중복 방지 — 제목을 "라이브스코어"에 고정하고 서로 링크.

## 성공 기준
1. `/scores/EPL` 200 + 제목 "프리미어리그 라이브스코어 …" + canonical 자기 자신 + noindex 없음.
2. `/scores/epl` → 308 → `/scores/EPL`. `/scores/XXX` 404.
3. sitemap.xml 에 /scores/{27} 포함.
4. 4~6주 뒤 GSC 쿼리 "라이브스코어" 노출·순위 비교 (기준선 = 10-01 캡처 요청).
