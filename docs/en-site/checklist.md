# 영어판(/en) v1 체크리스트

## 기반
- [x] `src/lib/i18n/en.ts` — 리그 영문명(SOCCER_LEAGUES 전수)·국가 영문명·지원 리그 셋·한→영 팀명(KBO·NPB)
- [x] `standings-overview.ts` locale 옵션 (en = 한글 매핑 skip)

## 페이지
- [x] `src/app/en/layout.tsx` — 영문 메타 기본값 + html lang 보정
- [x] `src/app/en/page.tsx` — 랜딩 (48h AI 픽 + 허브 링크)
- [x] `src/app/en/standings/page.tsx` — 순위 허브 (야구 전용 소스 + 축구 국가별)
- [x] `src/app/en/standings/[league]/page.tsx` — 리그 순위표 (야구 bb→ts캐시→calc 폴백)
- [x] `src/app/en/predictions/page.tsx` — 예측 허브 (Strong Pick + 리그 카드)
- [x] `src/app/en/predictions/[league]/page.tsx` — 경기 예측 + 최근 판정 결과

## 크롬(헤더·푸터)
- [x] `EnHeader` / `EnFooter` 컴포넌트
- [x] `SiteChromeHeader`/`SiteChromeFooter` 에 en 분기 추가
- [x] 언어 토글 — 한국어 헤더 EN 링크(LangSwitch), 영어 헤더 한국어 링크

## SEO
- [x] en 페이지 self-canonical + hreflang (ko↔en, x-default=ko)
- [x] ko 대응 페이지(홈·standings·predictions 허브/[league])에 hreflang 역방향
- [x] sitemap.ts 에 en URL 추가 (허브 3 + 핵심 리그 상세만)

## 검증
- [x] `npx tsc --noEmit` 통과
- [x] dev 서버 실렌더 — /en·/en/standings(+KBO·MLB·EPL)·/en/predictions(+KBO·EPL) 한글 잔존 없음
- [x] ko 회귀 없음 — 홈 200 + hreflang, /predictions/KBO 정상, 헤더 EN 토글
- [x] 언어 토글 경로 매핑 (/en/predictions/KBO ↔ /predictions/KBO)
- [ ] 커밋 + push (사용자 확인 후)

## v2 후보 (이번 범위 제외)
- NBA·NHL 순위 (NBA 소스 정비 중 / NHL 전용 포맷) — 지원 시 EN_STANDINGS_LEAGUE_SET 에 추가
- /en/scores 라이브 스코어
- 시즌 시뮬(우승 확률) 영어판
