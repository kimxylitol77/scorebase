# /en 자동 생성 미러 — 체크리스트

상태 표기: `[x]` 완료 · `[~]` 보류/불가(사유 명시) · `[ ]` 미착수

## 도구 (완료)

- [x] `scripts/en-mirror/extract.ts` — AST 로 한글 노드 추출 (주석 제외)
- [x] `scripts/en-mirror/build.ts` — 의존성 재귀 추적 + 2패스 변환
  - [x] `@/components/**` 미러 (렌더 한글 있는 것만, 없으면 원본 재사용)
  - [x] 페이지 옆 로컬 컴포넌트 미러
  - [x] 상대경로 import 재계산 (절대경로 경유)
  - [x] 잔존 검사 (`toKoreanTeamName`·`fmtKrw`·`frankfurter` 등)
- [x] `scripts/en-mirror/verify.ts` — HTTP 상태 + 화면에 보이는 한글 검사
  - ⚠️ SSR HTML 만 본다. 클라이언트 렌더(차트 축 등)는 못 잡음 → 브라우저 확인 병행
- [x] `/tmp/mkrule.py` — 보정 규칙 작성 헬퍼 (순차 적용 검증)

## 완료 · 배포됨 (21)

연봉·상금 (7)
- [x] /salaries/soccer · mlb · nba · nhl · f1 · tennis · golf

랭킹 (4)
- [x] /rankings/f1 · tennis · ufc · value-clubs

축구 데이터 (8)
- [x] /national-teams · /national-teams/[id]
- [x] /over-under · /over-under/[league]
- [x] /predictions/club-ranking · /predictions/title-race
- [x] /h2h/[pair]
- [x] /coaches/[id]

선수 (1)
- [x] /transfers/[id] — 로컬 컴포넌트 18개, 미번역 530 → 0

연결 (전부 완료)
- [x] 한국어 원본 hreflang 역방향 (양방향 출력 실측)
- [x] sitemap 등재 (오버/언더는 핵심 리그만, 선수 페이지는 미등재 — 아래 사유)
- [x] EnHeader 에 Salaries, EnFooter 에 신규 15개 링크
- [x] IndexNow 제출 (85건, HTTP 200)

## 불가 (3) — 데이터가 한국어 전용

- [~] **/salaries/kbo** — 선수·팀·포지션이 한글 원본뿐. 영문명 매핑이 생기면 가능
- [~] **/previews** — 프리뷰 기사 2,784건 제목이 전부 한국어 (기사가 본체)
- [~] **/previews/[league]** — 위와 같음

## 보류 (5) — 가능하지만 비용/우선순위

- [~] **/leagues/[league]** — 480건·컴포넌트 17개. 이미 배포된 `/en/standings/[league]` 와 기능 중복
- [~] **/world-cup** — 244건. 대진표 슬롯 라벨("E조 1위")이 `lib/predict/wc-bracket` 에서 한글 생성 → lib 수정 필요
- [~] **/world-cup/xg** — 위와 동반
- [~] **/odds** — 배당 컴포넌트 4개(`OddsFlowList` 하나가 109건)
- [~] **/value-bets** — 위와 동반
- [~] **/ballon** — 한글화가 `lib/ballon.ts` 안에서 일어나 lib 수정 필요. 계산기형 도구 페이지라 검색 유입이 낮다는 실측

## 이어받을 때

1. 재생성은 `npx tsx scripts/en-mirror/build.ts <route...> [--write]`
2. **`[preReplace 미적용]` 경고가 뜨면 반드시 확인** — 한국어 원본이 바뀌어 앵커가 어긋난 것.
   조용히 넘기면 metadata 가 한국어인 채 나간다
3. 렌더 검증 `npx tsx scripts/en-mirror/verify.ts /en/...`
   (`EN_VERIFY_BASE=https://www.scorebase.kr` 로 production 도 가능)
4. 차트가 있는 페이지는 브라우저에서 `document.body.innerText` 로 한 번 더
5. lib 에서 오는 한글은 `src/lib/i18n/en.ts` 에 영문 사전을 추가
   (현재 `UFC_WEIGHT_CLASS_EN`, `POS_EN`, `RADAR_AXIS_EN`)

### 선수 페이지를 sitemap 에 안 넣은 이유

영어판은 커리어 타임라인·국적이 빠져 한국어판(4,094명 등재)보다 얇다.
같은 규모로 실으면 thin 희석 위험이 커서, `/en/national-teams/[id]`·`/en/transfers` 의
내부 링크에 크롤을 맡겼다. 색인 상황을 보고 나중에 판단한다.
