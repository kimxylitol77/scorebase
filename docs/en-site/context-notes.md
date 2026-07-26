# 영어판(/en) — 컨텍스트 노트

## 배경·결정 (2026-07-26)

- 사용자 요청. "사이트 한글+영문으로 영어권 공략".
- **7/5 SEO 진단에서 영어판을 한 번 기각했던 이력 있음** ([[seo-indexing-crash-2026-05]]) — "저권위+thin 플래그 도메인에 영어 콘텐츠층 추가는 역효과". 이번엔 리스크 관리형으로 진행.
- 사용자 선택 (AskUserQuestion). **/en 하위경로 + 핵심 데이터 페이지만**, **글(아티클)은 한국어 유지**.
- 전면 [locale] 개편·별도 도메인·클라이언트 토글은 기각.

## v1 범위

- `/en` 랜딩 · `/en/standings`(+`[league]`) · `/en/predictions`(+`[league]`).
- 글·커뮤니티·라이브(/scores 풀버전)는 v1 제외. 반응 보고 확장.
- 리그는 핵심만 (빅5·UCL·MLS·K리그·J1 + MLB/KBO/NPB + NBA/NHL). e스포츠·배구는 전용 컴포넌트가 복잡해 v1 제외.

## 아키텍처 결정

1. **[locale] 세그먼트 재구성 안 함** — 128개 페이지 이동 리스크 > 이득. `/en/*` 전용 라우트를 별도 파일로 둔다. 영어 페이지는 한국어 페이지의 1:1 클론이 아니라 **린(lean) 버전** — 데이터 계층만 공유.
2. **데이터 계층은 그대로 재사용** — DB 원본(팀명·선수명)이 이미 영문. 한국어는 표시 시점에 `toKoreanTeamName` 등으로 입히는 구조라, 영어판은 그 매퍼를 건너뛰면 됨.
   - `getFullStandings`(standings-helper) — position/points/WDL/GF/GA 제공, 영어판 순위표에 그대로 사용.
   - `Match.predHome/Draw/Away · predOverPick · predHcPick · marketHome...` — 영어판 예측 페이지에 그대로 사용.
3. **헤더/푸터 분기 = 기존 SiteChromeHeader 패턴 확장** — 이미 pathname/host 로 클라이언트 분기 중. `en` prop 추가해 `/en` 경로면 영어 헤더 렌더. root layout 이 headers() 를 안 읽는 원칙(전체 ISR) 유지.
4. **html lang="ko" 는 유지** — root layout 하드코딩. /en 은 layout 중첩으로 못 바꾸므로 en/layout 의 클라이언트 컴포넌트가 `document.documentElement.lang='en'` 보정. 구글은 lang 속성 무시하고 콘텐츠·hreflang 로 판단하므로 SEO 영향 없음.
5. **SEO 안전장치** (7/5 기각 사유 대응).
   - en 페이지 전부 self-canonical + hreflang(ko↔en 상호, x-default=ko).
   - sitemap 에는 en 핵심 URL 만 추가 (thin 희석 방지 — 6/20 군소리그 정리 원칙 유지).
   - 새 라우트는 자체 canonical 필수 (layout 이 기본값 안 줌 — 5월 사고 재발 방지).

## 구현 메모

- `src/lib/i18n/en.ts` — LEAGUE_DISPLAY_EN·COUNTRY_EN·EN_LEAGUES(지원 리그 셋). 단일 파일, 과추상화 금지.
- **함정 1 — "DB 팀명=영문" 가정은 KBO·NPB 에서 깨짐**. 두 리그만 Team.name 이 한글 저장 (전수 스캔: KBO 10·NPB 12 + e스포츠 일부). `toEnglishTeamName()` 한→영 사전으로 해결. 새 리그 추가 시 한글 스캔 필수.
- **함정 2 — getFullStandings 는 야구·농구·하키를 못 준다** (축구 전용에 가까움). 야구는 fetchBaseballTable(KBO·NPB) → ts캐시 → calcStandings(MLB) 3단 폴백. NBA(소스 정비 중)·WNBA·NHL(전용 포맷)은 v1 순위 제외 — EN_STANDINGS_LEAGUE_SET 에 없음 = hreflang·sitemap·허브 카드 모두 자동 제외.
- 허브 야구 섹션은 fetchSportGroups 로는 비어 보이므로 fetchBaseballGroup() 전용 구성.
- `standings-overview.ts` fetch 함수들에 `locale` 옵션 추가 (en 이면 한글 변환 skip + 영문 국가/리그명).
- 언어 토글. 한국어 헤더에 EN 링크(클라이언트 LangSwitch, usePathname 매핑), 영어 헤더에 한국어 링크.
- LiveScoresBar(한국어 팀명)는 en 분기에서 렌더 안 함 — SiteChromeHeader en prop 에 미포함으로 자동 해결.
- LivePipScore·Chatbot 은 전역 렌더 유지 (챗봇은 사용자 영역 — 건드리지 말 것).
