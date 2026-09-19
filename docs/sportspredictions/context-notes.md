# sportspredictions.live 컨텍스트 노트 (결정 로그, 덧붙이기만)

## 2026-09-19

**도메인 실측.** 2026-09-18 Namecheap 등록(어제). 이전 소유자가 2023-06~2026-05 워드프레스로 유료 베팅 팁 사이트 운영(VIP Betting Tips·Mega Combo·Refund Policy, 페이지네이션 9,884p). Wayback 3,739건. Spamhaus·SURBL·URIBL 미등재, 구글 세이프브라우징 안전. DuckDuckGo 잔존 색인 9건. 백링크는 유료 도구 없어 미확인.

**결정 1. 301/랜딩이 아니라 예측 전문 자매 사이트.**
근거. 도메인이 영어 일반 키워드. 스코어베이스 병목 = 검색 권위(GEO 감사 참고). 자매 사이트 → 스코어베이스 한 방향 링크로 권위 보태기. 301은 옛 도박 신호를 스코어베이스에 흘림.

**결정 2. 영어 전용.** 한국어 수요는 스코어베이스가 이미 받음. hreflang 불필요.

**결정 3. 별도 저장소 대신 같은 Next.js 저장소, 호스트 분기.**
근거. 스코어보드.kr 분기 패턴(`SCOREBOARD_HOSTS`)이 이미 있음. 예측 라이브(`src/lib/predict/*`, accuracy-stats.ts 는 ko+en 단일 소스) 재사용. Vercel 프로젝트 1개 유지 = 비용 0 추가.
주의. 스코어보드.kr 분기는 noindex를 붙임(L152). sp는 색인돼야 하므로 그 분기에서 제외. `SITE_URL`은 www.scorebase.kr 상수라 sp용 `spUrl` 별도.

**결정 4. 내부 경로 `/sp/*` + rewrite.** URL은 사용자에게 그대로 보이고 서버만 `/sp`로 간다. 다른 호스트에서 `/sp` 직접 접근은 404로 막아 중복 색인 방지.
대안 검토. 라우트 그룹 `(sp)`는 `/`와 충돌. 언더스코어 폴더는 라우팅 자체가 안 됨. → `/sp` 접두 + 가드가 가장 단순.

**결정 5. 옛 URL 전부 410.** 옛 사이트와 콘텐츠 연속성 없음. 404보다 410이 색인 제거가 빠름. 리다이렉트로 살릴 가치 있는 URL 없음(자동 생성 경기 글).

**결정 6. 로그인 없음.** OAuth redirect_uri가 www.scorebase.kr 고정(middleware L96). 자매 도메인에서 로그인은 307으로 넘어가서 UX 깨짐. 예측 열람만 제공.

**결정 7. 디자인 = Kickoff.ai 밀도 + 라이트 기본.**
ui-ux-pro-max 실측 결과는 Fira Code/Sans + 블루 팔레트(Real-Time/Operations 패턴)였으나, 기존 저장소가 Geist Mono를 이미 쓰고 Inter가 스포츠 데이터 사이트에서 더 중립적이라 Inter+Geist Mono로 조정. 팔레트는 DB의 "Magazine/Blog 에디토리얼(zinc)" 계열에 홈/무/원정 3색(emerald/amber/blue)만 얹음. 스코어베이스 기본 dark와 달리 sp는 light 강제 (참고 사이트 전부 라이트, 에디토리얼 신뢰감).
참고 사이트 확인 결과. Kickoff.ai = 흰 배경·3분할 확률 바·한 줄 카드(채택). Opta Analyst = 에디토리얼 톤(채택), 상단 라이브 티커(보류). Dimers = 리그 칩 가로 스크롤(채택), 도박 CTA·네이비 히어로(배제). Polymarket·Kalshi = 한국에서 451/빈 화면이라 참고 불가.

**결정 8. 도박 문구 전면 금지.** "betting tips/VIP/sure win/odds boost" 미사용. 이전 사이트 분류에서 벗어나는 게 초기 SEO의 핵심. 배당은 "market implied probability"로만 표기.

**보류.** 자매 사이트 자체 블로그(영어 분석 글). 옛 분류 해소·색인 안정 후 판단. 우선 데이터 페이지만.

**사용자 할 일.** Namecheap DNS, Vercel 도메인 추가, GSC·Bing 등록. 코드 작업은 이 셋과 독립적으로 진행 가능(로컬은 Host 헤더로 검증).
