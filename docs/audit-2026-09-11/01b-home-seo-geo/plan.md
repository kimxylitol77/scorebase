# 과제 1 후속 — 홈 SEO·GEO 정합

> 과제 1(H1 수익률 주장) 배포 뒤 남은 어긋남 4건. 브랜치 `audit/01b-home-seo-geo`. 새 기능 없음, 문구·구조화 데이터만.

## 무엇을·왜
1. **og:title / twitter:title** — 설명은 수익률을 말하는데 제목은 옛 문구("감이 아니라…")라 공유 카드가 다른 말을 한다 → claim 있을 때 제목도 수익률 주장으로.
2. **FAQ JSON-LD Q4** "도박·베팅과는 무관합니다" — 첫 화면이 픽 수익률을 말하고 「배당」 메뉴·베트맨이 생긴 지금 사실과 어긋난다. AI 답변엔진이 그대로 인용한다 → "베팅을 중개·권유하지 않고 배당을 분석·검증 대상으로 다룬다" 로.
3. **FAQ 에 핵심 주장 부재** → "스코어베이스 AI 픽의 수익률은 얼마인가요?" 를 claim 기반 동적 답으로 추가(없으면 항목 생략).
4. **llms.txt** — 적중률 페이지를 "실측 적중률" 로만 소개, 수익률·밸류 베트·배당 흐름 언급 없음 → 배당·수익률 섹션 추가.

## 어떻게
- `src/app/page.tsx`: `generateMetadata` 에 og/twitter title 추가. `faqJsonLd` 상수를 `buildFaqJsonLd(claim)` 로 바꿔 Home 이 `roiClaim()`(1h 캐시, 히어로·meta 와 같은 값)을 넘긴다.
- `public/llms.txt`: 정적 파일 — 수치는 쓰지 않고(고정되면 거짓이 된다) 페이지 설명만 갱신.
- EN 미러 `/` 재생성(사전 추가).

## 검증
- tsc·eslint. FAQ JSON-LD 파싱·Q 개수(claim 있으면 5, 없으면 4)·Q4 문구 단위 테스트.
- dev 렌더 `/` head: og:title·twitter:title 에 수익률, FAQ 스크립트에 수익률 Q. `/en` 동일. EN 잔여 한글 0.
