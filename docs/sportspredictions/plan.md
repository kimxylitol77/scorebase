# sportspredictions.live — 영어 전용 예측 자매 사이트 계획

작성 2026-09-19. 도메인 등록 2026-09-18 (Namecheap, 만료 2027-09-18).

## 1. 목표

스코어베이스의 AI 예측 데이터(Match.pred*, AiPrediction, accuracy-stats)를 **영어 전용 · 예측 전문** 사이트로 노출한다.
역할 분담. 자매 사이트 = "오늘의 예측 목록 + 모델 성적표". 상세 분석·선수·팀 = www.scorebase.kr/en 으로 한 방향 링크.

성공 기준.
- sportspredictions.live 접속 시 영어 홈이 뜨고, 스코어베이스 헤더·한국어가 한 글자도 안 보인다.
- 옛 URL(`/2023/*`, `/page/*`, `/vip-betting-tips` 등)은 410 응답.
- canonical·robots·sitemap이 sportspredictions.live 기준으로 나온다. scorebase.kr 쪽 sitemap에 sp 경로가 섞이지 않는다.
- Lighthouse 모바일 접근성 90 이상, 본문 대비 4.5:1.

## 2. 하지 않는 것

- 로그인·회원·픽 저장 기능 (OAuth redirect_uri가 www.scorebase.kr 고정이라 자매 도메인에서 불가. 필요 없음).
- 한국어 병행. 영어 전용.
- "betting tips / VIP / sure win" 류 문구·페이지. 옛 사이트 분류로 되돌아감.
- 옛 URL 리다이렉트 복원. 전부 410.
- 스코어베이스 → 자매 사이트 역방향 링크 네트워크. 링크는 자매 → 스코어베이스 한 방향만.

## 3. 아키텍처 (같은 저장소, 호스트 분기)

```
sportspredictions.live 요청
  → src/middleware.ts: host 판정 (SP_HOSTS)
      · path=/robots.txt, /sitemap.xml → rewrite /sp/robots.txt, /sp/sitemap.xml
      · 옛 URL 패턴 → 410
      · 그 외 → rewrite /sp{path}   (URL은 그대로 유지)
  → src/app/sp/** (영어 전용 라우트 트리, 자체 layout)
scorebase.kr 에서 /sp/* 직접 접근 → middleware 404 (내부 경로 노출 방지)
```

- 기존 패턴 재사용. 스코어보드.kr 분기(`SCOREBOARD_HOSTS`, L13/L27/L130)를 그대로 복제하되, **X-Robots-Tag noindex는 적용하지 않는다** (L152 분기에서 제외).
- `src/lib/sp/site.ts` = `SP_URL`, `spUrl(path)`. `SITE_URL`(site-url.ts)은 건드리지 않는다.
- 다크모드. layout.tsx 인라인 스크립트(L114)가 기본 dark. sp 호스트는 스코어보드.kr처럼 **강제 light**로 분기 추가.
- 헤더·푸터. `SiteChromeHeader/Footer`는 pathname `/sp` 접두로 sp 전용 크롬 반환(`/en` 분기 L28 옆에 추가). sp layout이 자체 크롬을 그리므로 루트 크롬은 null 반환이면 충분.
- 폰트. Pretendard 대신 Inter(next/font) + 기존 Geist Mono(숫자 tabular). sp layout에서만 로드.
- Vercel. 대시보드에서 도메인 추가(사용자). Namecheap DNS = A `76.76.21.21`, CNAME www → `cname.vercel-dns.com`. 포워딩 해제.

## 4. 페이지 (6종)

| 경로 | 내용 | 데이터 소스 | 스코어베이스 링크 |
|---|---|---|---|
| `/` | 오늘·내일 경기 예측 리스트 (리그 탭, 확률 바, 픽) | Match.predHome/Draw/Away + predWinner, EN_PREDICTION_LEAGUES 13개 | 각 카드 → /en/predictions/[league] |
| `/[league]` | 리그별 예측 + 최근 적중률 | 위 + accuracy-stats.ts | /en/standings/[league] |
| `/match/[id]` | 한 경기 예측 근거 (1X2·O/U·핸디캡·시장배당 갭·7모델 픽) | Match + AiPrediction(published=true) | /en/h2h/[pair], /en/teams/[id] |
| `/accuracy` | 모델 성적표 리더보드 (scorebase·gpt·claude·grok·gemini·kimi·qwen) + 리그별 적중률 + 신뢰도 곡선 | accuracy-stats.ts, AiPrediction.correct, ReliabilityCurveChart | /en/predictions/scorecard |
| `/methodology` | Elo(MoV)+Dixon-Coles+시장 블렌드 설명, 발행 게이트, 데이터 소스 | 정적 | /en/benchmark/method |
| `/about` | 무료·데이터 기반 명시, 운영자, 문의 | 정적 | www.scorebase.kr |

JSON-LD. `/` WebSite+Organization, `/match/[id]` SportsEvent, `/accuracy` Dataset. hreflang 없음(영어 단일). canonical = spUrl.

## 5. 디자인 방향 (사용자 지정 2026-09-19. predictifysports.com 스타일)

참고 사이트 = **predictifysports.com** (직접 실측). 다크 네이비 배경, 유리 느낌 카드, 라임 포인트, 큰 굵은 제목.
Kickoff.ai 의 "한 줄 확률 바" 밀도는 카드 내부 레이아웃에만 차용.

실측 토큰 (`src/app/sp/sp.css`, 컴포넌트에 raw hex 금지).
| 역할 | 값 | 출처 |
|---|---|---|
| bg | #060A1E | body 배경 |
| bg-elev (카드) | rgba(15,23,42,.8) + 1px rgba(255,255,255,.06) + radius 12 + blur | .glass-card |
| fg / muted / dim | #F1F5F9 / #94A3B8 / #52637A | 텍스트 3단 |
| lime (포인트·CTA) | #A4FF00, 라인 rgba(164,255,0,.25) | 강조 카드 테두리·버튼 |
| indigo | #493EE5 | 보조 강조 |
| green / amber / red | #10B77F / #D4A043 / #EF4444 | 적중·주의·실패 |
| home / draw / away | green / amber / #627EEA | 3분할 확률 바 |

폰트 (next/font, sp layout 한정). 제목 **Sora** 800, 본문 **Plus Jakarta Sans**, 숫자 **JetBrains Mono** tabular-nums.

구성 (predictify 홈 골격을 따르되 도박 요소 제거).
1. 히어로 = 상태 배지("AI models active" + 라이브 점) · 큰 H1 · 부제 · CTA 2개(Today's picks / How it works)
2. Coming up = 다가오는 경기 가로 카드 스트립(킥오프 카운트다운)
3. Top predictions = 확신 높은 픽 카드(% 크게, 팀명, 시작까지 남은 시간)
4. 리그 칩 마키 = EPL ◆ LaLiga ◆ … (가로 스크롤)
5. 통계 3칸 = 리그 수 / 매일 갱신 / 무료·가입 없음
6. "Honest accuracy" 문단 + 성적표 링크

금지. 이모지 아이콘(SVG·텍스트로), 베팅 보너스 배너, 18+ 배지, "Value bets/Parlay" 메뉴, 확률 과장.
모션. 카운트다운 숫자 갱신·스크롤 페이드(≤300ms)만. prefers-reduced-motion 존중.

## 6. 단계

```
0. 문서·DNS·GSC     → 검증: 이 문서 3종 커밋, 사용자 DNS 변경, GSC 도메인 속성 추가
1. 라우팅 골격       → 검증: curl -H "Host: sportspredictions.live" localhost → /sp 홈 SSR, /2023/x → 410, scorebase.kr/sp → 404
2. 토큰·크롬·layout → 검증: light 강제, Inter 로드, 한국어 0건 (grep -P '[가-힣]' src/app/sp)
3. 페이지 6종        → 검증: 각 경로 200, 오늘 데이터 있는 날 카드 ≥1, 모델 7개 행
4. SEO              → 검증: canonical·robots·sitemap 호스트 = sportspredictions.live, Rich Results 테스트 통과
5. 배포·검증         → 검증: tsc, 프로덕션 curl, Lighthouse 모바일, GSC URL 검사
6. 사후              → GSC 색인 요청, 백링크 확인 후 disavow, 30일 뒤 노출·클릭 확인
```

각 단계 끝나면 커밋 1개. 4단계 전까지 sitemap은 내지 않는다(옛 URL 청소 먼저).
