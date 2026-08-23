# /en 자동 생성 미러 — 체크리스트

## Phase 0 — 준비
- [x] 현황 실측 (한국어 116 / 영어 13, 서버 컴포넌트 144/144, i18n 없음)
- [x] 방식 결정 — 자동 생성 미러
- [x] 범위 결정 — SEO 핵심 29개
- [x] plan.md
- [x] checklist.md
- [x] context-notes.md

## Phase 1 — 변환 스크립트 프로토타입 (완료)
- [x] TypeScript compiler API 직접 사용 (ts-morph 불필요)
- [x] 한글 리터럴 추출기 `extract.ts` (JSX 텍스트 / 문자열 / 템플릿 조각 구분, 주석 제외)
- [x] 미러 빌더 `build.ts` — 의존성 재귀 수집 + 2패스 변환
- [x] 상대경로 import 재계산 (절대경로 경유 — `../` 추가 방식은 형제 파일에서 틀림)
- [x] 컴포넌트 미러 + import 경로 자동 치환
- [x] `/salaries/golf` 로 1차 검증 — 미번역 0건
- [x] `npx tsc --noEmit` 통과 (종료코드 0)
- [x] 검증: 렌더 경로 한글 0건
- [x] 검증: dev 서버 실제 렌더 확인 (선수 60명, 탭·표·푸터 전부 영어)

## Phase 2 — 사전 구축
- [ ] 29개 페이지 전체에서 한글 문자열 추출 (~1,731줄)
- [ ] 중복 제거 후 고유 문구 수 집계
- [ ] LLM 배치 번역 → `src/lib/i18n/ui-en.json`
- [ ] 검증: 미번역 항목 0건

## Phase 3 — 일괄 생성
연봉 랭킹 (8)
- [x] /salaries/soccer  - [x] /salaries/mlb  - [x] /salaries/nba  - [x] /salaries/nhl
- [~] /salaries/kbo — **불가**: 선수·팀·포지션이 한글 원본뿐, 영문명 데이터 없음  - [x] /salaries/f1  - [x] /salaries/tennis  - [x] /salaries/golf

랭킹 (4)
- [x] /rankings/f1  - [x] /rankings/tennis  - [x] /rankings/ufc  - [x] /rankings/value-clubs

축구 데이터 (17)
- [ ] /transfers/[id]  - [ ] /leagues/[league]  - [ ] /previews  - [ ] /previews/[league]
- [ ] /h2h/[pair]  - [x] /over-under  - [ ] /over-under/[league]  - [ ] /odds
- [ ] /value-bets  - [ ] /coaches/[id]  - [x] /national-teams  - [ ] /national-teams/[id]
- [~] /ballon — 보류: lib/ballon.ts 안에서 한글화. 도구 페이지라 검색 유입 낮음  - [ ] /world-cup  - [ ] /world-cup/xg
- [x] /predictions/title-race  - [x] /predictions/club-ranking

- [ ] 검증: `npx tsc --noEmit` 통과

## Phase 4 — 연결·검증
- [ ] 한국어 페이지에 hreflang 역방향 추가
- [ ] sitemap 에 /en 29개 등재
- [ ] dev 서버로 29개 라우트 200 확인
- [ ] 육안 확인 — 한글 잔존 / 깨진 문장
- [ ] 영어 헤더/푸터 네비게이션에 새 경로 반영

## Phase 5 — 배포
- [ ] 커밋 (기능 단위 분할)
- [ ] push → Vercel 배포 확인
- [ ] production 200 확인
- [ ] IndexNow 제출
