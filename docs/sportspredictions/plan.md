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

## 5. 디자인 방향 (ui-ux-pro-max 실측 + 참고 사이트)

참고 사이트.
- **Kickoff.ai** (kickoff.ai/matches) — 1순위. 흰 배경, 한 줄에 팀·3분할 확률 바·시간. 이 밀도를 그대로 따른다.
- **Opta Analyst** (theanalyst.com) — 에디토리얼 톤·신뢰감. 상단 라이브 티커 아이디어만 차용.
- **Dimers** (dimers.com) — 리그 칩 가로 스크롤·카드 구조는 참고, 도박 CTA·네이비 히어로는 반면교사.

스타일. 라이트 기본, Exaggerated Minimalism 축소판(큰 숫자·여백, 장식 없음). 카드 테두리 1px, 그림자 없음.

토큰(`src/app/sp/sp.css`, 컴포넌트에 raw hex 금지).
| 역할 | 값 |
|---|---|
| background | #FAFAFA |
| foreground | #09090B |
| muted-fg | #64748B |
| border | #E4E4E7 |
| home (홈 승) | #059669 |
| draw | #A16207 |
| away | #2563EB |
| accent (CTA·링크) | #1E40AF |
| correct / wrong | #16A34A / #DC2626 |

폰트. 제목·본문 Inter, 숫자 Geist Mono `font-variant-numeric: tabular-nums`.
확률 바. 3분할 스택 바(home/draw/away), 숫자는 바 위에 %로. 색만으로 구분하지 않도록 라벨 병기.
리더보드. 정렬 가능한 테이블, 1위 강조는 굵기만. 모바일은 카드 전환.
모션. 스크롤 리빌 y 8px 300ms 이하, prefers-reduced-motion 존중. 그 외 애니메이션 없음.
금지. 이모지 아이콘, 네온·글래스, 배당 강조, "Sure win" 배지.

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
