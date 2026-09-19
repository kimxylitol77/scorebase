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

**결정 9 (사용자 지정). 디자인 = predictifysports.com 스타일.** 결정 7 의 라이트/Kickoff.ai 안은 폐기.
실측(JS computed style). body #060A1E, 텍스트 #F1F5F9/#94A3B8, glass-card rgba(15,23,42,.8)+1px white/6%+radius 12, 라임 #A4FF00, 폰트 Sora/Plus Jakarta Sans/JetBrains Mono, Next.js+Tailwind. 이모지 메뉴·베팅 보너스 배너·18+ 는 우리 사이트에서 제외(결정 8 유지).

**Phase 1 실측 함정.**
- middleware rewrite(`/` → `/sp`) 에서는 `usePathname()` 이 브라우저 URL(`/`)을 준다. 루트 크롬의 `/sp` 검사가 SSR 에서 실패해 한국어 헤더·푸터가 HTML 에 실렸다(한글 3,337자). 렌더 트리 기준인 `useSelectedLayoutSegment() === "sp"` 로 교체 → SSR 에서도 정확.
- 중첩 layout 의 `title.default` 는 루트 템플릿("%s | Scorebase")을 탄다. `title.absolute` 로 끊음.
- 옛 URL 이 trailing slash(`/vip-betting-tips/`)면 Next 가 middleware 전에 308 로 슬래시를 떼고, 그 다음 요청이 410. 2단계지만 구글은 최종 410 으로 처리하므로 허용.
- next.config `redirects()` 는 host 무관(apex→www 만 host 조건). `/teams`, `/live` 등 소스 경로가 sp 호스트에도 적용되나 sp 라우트와 충돌 없음. www.sportspredictions.live → apex 308 추가.
- 로컬 검증 = `sp.localhost:3000` (NODE_ENV≠production 에서만 SP_HOSTS 에 포함).
- `npx tsc` 에 `src/app/api/vote/route.ts` 오류 3건이 **기존부터** 있음(MatchVote 복합 unique 이름 불일치, Prisma generate 필요 추정). 이 작업과 무관, 미수정.

**Phase 3·4 결정.**
- 데이터 새 계산 없음. `src/lib/sp/data.ts` 는 Match.pred*·AiPrediction·accuracy-stats.statForLeague 를 그대로 읽어 영어 shape 로만 바꾼다. 리더보드 집계는 /en/predictions/scorecard 규칙(발행·킥오프 전·FINISHED 만 채점·gpt 통합) 복제.
- 발행 게이트(shouldPublishPick)는 목록에 적용하지 않음 — 확률은 전부 보여주고 "strong" 만 strongPickThreshold 로 표시. 근거 = 이 사이트의 주장은 "픽 판매" 가 아니라 "확률 공개+채점".
- 리그 URL = 영어 슬러그(`/premier-league`, `/k-league` …). 라우트는 `[...slug]` catch-all 로 두어 깊은 경로도 sp 전용 404 가 뜬다(단일 세그먼트만 리그로 해석).
- 킥오프 시각 = LocalTime 클라이언트 컴포넌트. SSR 은 UTC 문자열, 마운트 후 로컬 시간. hydration TZ 불일치(#418) 회피.
- 스코어베이스 딥링크 = /en/teams/{id}·/en/predictions/{code}·/en/benchmark/method 만. /en 에 live 경기 페이지가 없어 경기 단위 링크는 없음.
- 남은 한글 1건 = 루트 layout head 의 RSS `<link title="스코어베이스 블로그 RSS">`. 본문 아님, 방치.
- sitemap 117 URL(정적 4 + 리그 13 + 7일 경기 100). 검증일 홈 48h 경기 21건, 리더보드 7모델 전부 표시.
