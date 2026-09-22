# 베트맨 프로토 강화 1차 — 체크리스트

## 0. 준비
- [x] 브랜치 `betman-proto-round` (origin/main 23636bf 기준 — 작업 시작 브랜치는 291커밋 뒤라 갈아탐)
- [x] 경쟁 실측·DB 실측 → context-notes

## 1. DB
- [x] `prisma/schema.prisma` — `BetmanOdds.mchScore String?`, 신규 `BetmanOddsChange`
- [x] `prisma/sql/20260921-betman-change.sql` (lock_timeout 3s, IF NOT EXISTS)
- [x] 운영 적용 (장기 트랜잭션 확인 → 실행) · `npx prisma generate`
- [x] 검증: `\d "BetmanOddsChange"` 컬럼 확인

## 2. 적재
- [x] `route.ts` — `mchScore` upsert 컬럼 추가, `tooltipList` → `BetmanOddsChange` ON CONFLICT DO NOTHING
- [x] `lightsail-worker/betman-odds-cron.js` — body 에 `tooltipList` 동봉
- [x] 로컬 검증: 실제 260112 응답(scratchpad bm112.json)으로 dev 라우트 POST → 변경 36건 적재
- [x] Vultr 배포 (scp → chown → node --check) · 수동 1회 실행 — 260112 변동 13 · 260111 변동 419 적재

## 3. 라이브러리
- [x] `src/lib/odds/betman-result.ts` (순수) — 결과 코드→라벨, AI 판정, 회차 집계, 변동 요약
- [x] `src/lib/odds/betman-result.test.ts`
- [x] `betman.ts` — `getBetmanRounds`, `getBetmanMatches(take, gmTs?)` 결과·AI픽·변동 동봉, `getBetmanRoundScorecard`
- [x] 언더오버 라벨 뒤집힘 수정

## 4. 화면
- [x] `BetmanRoundBar.tsx` — 회차 칩(발매중 + 최근 10)
- [x] `BetmanRoundScorecard.tsx` — 회차별 AI 적중률 카드
- [x] `BetmanOddsPanel.tsx` — 결과 칩·스코어·AI 도장·▲▼, 아카이브 모드 문구
- [x] `odds/page.tsx` — `round` 파라미터, 캐시 키, 메타데이터(`odds-seo.ts` 회차용)

## 5. 검증
- [x] `npm test` · `npm run typecheck` · `npx eslint` 대상 파일
- [x] dev 렌더: `/odds?sport=betman` (발매중) · `&round=260111` (결과) · `&round=260110&item=BS`
- [x] 수치 대조: 성적표 260111 축구 56/117 · 야구 42/72 — 프로토타입(57/123·48/88)보다 작은 건 전반(h) 승패 라인 제외 때문(의도)
- [x] 모바일 폭 스크린샷 — 칩이 카드 밖으로 안 나감

## 6. 마무리
- [x] 커밋 3개(d13e9b7·6000f40·4f09ffa) → main push → Vercel 배포 확인(~3분, 회차 페이지 title)
- [x] 운영 렌더 재확인(260111: AI 적중 101·빗나감 92 = scored 193 일치) · 메모리 갱신(`betman-proto-strengthen-plan`)

## 7. 2차 (9/22, 톡티 벳스코어 대응 3종)
- [x] 경기 상세 베트맨 카드 "이 배당대 역대 결과" 한 줄 — `bandRowForOdds`(odds-band-stats) + 1h unstable_cache, 표본 100 미만 생략
- [x] 베트맨 카드 초기·현재·해외 3열 — `getBetmanLineForMatch` 가 BetmanOddsChange 첫 변경 전 값을 `opening` 으로 동봉, ▲▼
- [x] /tools 인덱스 + 프로토 조합 계산기 + 토토 복식 조합 계산기(승무패·승1패·승5패, 1조합 1,000원) · 네비(배당 메뉴)·푸터·사이트맵 · `/tools` 임시 리다이렉트 제거
- [ ] dev 검증(계산기 상호작용 OK) → 상세 카드 실렌더 → 커밋·푸시·운영 확인
