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
- [ ] /transfers/[id]  - [ ] /leagues/[league]  - [~] /previews — **불가**: 기사 제목 2,784건이 한국어. UI만 영어면 저품질  - [~] /previews/[league] — **불가**: 위와 같음
- [x] /h2h/[pair]  - [x] /over-under  - [x] /over-under/[league]  - [ ] /odds
- [ ] /value-bets  - [x] /coaches/[id]  - [x] /national-teams  - [x] /national-teams/[id]
- [~] /ballon — 보류: lib/ballon.ts 안에서 한글화. 도구 페이지라 검색 유입 낮음  - [ ] /world-cup  - [ ] /world-cup/xg
- [x] /predictions/title-race  - [x] /predictions/club-ranking

- [ ] 검증: `npx tsc --noEmit` 통과

## Phase 4 — 연결·검증 (1차분 완료)
- [x] 한국어 페이지 17곳에 hreflang 역방향 추가 (양방향 출력 실측 확인)
- [x] sitemap 에 영어 신규 URL 등재 (오버/언더는 핵심 리그만)
- [x] dev 서버로 18개 라우트 200 확인 · 렌더 한글 0
- [x] 육안 확인 — 문구 결함 교정 (공백·어순·단위)
- [x] 영어 헤더/푸터 네비게이션에 새 경로 반영
- [x] 한국어 원본 회귀 확인 (수정한 6개 페이지 200)

## Phase 5 — 배포
- [ ] 커밋 (기능 단위 분할)
- [ ] push → Vercel 배포 확인
- [ ] production 200 확인
- [ ] IndexNow 제출
