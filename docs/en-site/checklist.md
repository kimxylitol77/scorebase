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
- [x] 커밋 + push + production 검증 (9d6eb36 + 33b3006 keywords 후속fix)

## v2 (2026-07-26 배포 완료, 2e2c852)
- [x] /en/scores — DB 직조회 라이브 스코어 (UTC date 네비 + LIVE 60초 자동 새로고침, e스포츠 제외)
- [x] /en/predictions/accuracy — 적중률 성적표 (lib/predict/accuracy-stats 추출로 ko 와 숫자 단일 출처)
- [x] EnHeader Scores 메뉴·랜딩 3카드·LangSwitch scores 커버·ko hreflang 역방향·sitemap 2건

## v3 (2026-07-26 배포 완료, 0dd00a5)
- [x] Season outlook — /en/predictions/[league] Monte Carlo 시즌 시뮬 (_season-sim.ts, 남은 일정 있는 시즌만·야구 xPts 숨김)
- [x] NHL 순위 — /en/standings/NHL 공식 API 컨퍼런스 표 + 허브 Ice Hockey 카드

## v4 — 데이터 완전판 (2026-07-26 배포 완료)
- [x] 순위 상세 Season leaders (28825b6) — playerNameEn 라틴만, KBO/NPB 자동 숨김, koTeamNameToEnglish 역방향
- [x] /en/scores 강화 (28825b6) — AI 픽 확률 + 시장 배당 칩, 리그 헤더 Predictions 링크
- [x] /en/injuries/[league] (28825b6) — 축구 9리그(af) + NBA/MLB/NHL(ESPN), KBO/NPB 제외
- [x] /en/players/[pid] (4b460e8) — MLB 타자/투수 + 축구(?league=), KBO/NPB/NBA/NHL/LOL 404
- [x] /en/teams/[id] (4b460e8) — 전 리그, 성적+일정+로스터(축구 ts 스쿼드·MLB 링크·NHL·NBA)
- [x] /en/transfers (ecb3d80) — 루머 스테이지·공식 피드·시장가치 Top 10, 이름 라틴 가드

## v4.1 (2026-07-26 배포)
- [x] /en/predictions/scorecard (1f7c43d) — 멀티 AI 리더보드 (ko 와 수치 일치 검증) + en/layout twitter 메타 영문화

## v5 후보
- NBA 순위 — ko 데이터 소스 정비 완료 후 (오염 데이터 노출 방지로 보류 중)
- /en/scores e스포츠 (팀명 영문화 후)
- /en 선수 페이지 NBA/NHL 뷰 이식, /en/transfers/[id] 선수 시장가치 상세
- 새 글 한/영 동시 생성 (사용자 결정 대기 — AI 비용 2배)
