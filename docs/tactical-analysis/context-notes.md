# 전술 분석 아티클 자동 생성 — 컨텍스트 노트

> 결정과 근거 기록. 계속 덧붙임.

## 왜 별도 타입인가

기존 `ANALYSIS`([src/jobs/generate-analysis.ts](../../src/jobs/generate-analysis.ts))는 **리그 시즌 종합**(판세·순위·핫팀). 전술 분석은 **매치/맞대결 단위 심층**(포메이션 상성·xG 흐름·키플레이어 매치업). 층이 다르므로 `Article.type = "TACTICAL"` 신설.

## 재사용 고리 (새로 짜지 않음)

- `Article` 모델 — `type` 문자열만 추가. content(Markdown)·status·slug·스냅샷 필드 그대로.
- `buildMatchBrief` / `buildMatchContext` ([src/lib/chatbot/match-brief.ts](../../src/lib/chatbot/match-brief.ts)) — 이미 매치 단위 Elo·폼·H2H·xG(fixtureStats 파싱)를 조립. 여기에 라인업·매치스탯만 얹으면 전술 컨텍스트 완성.
- `generateWithMinLength` + Claude `generate` ([src/lib/ai/generate-with-min-length.ts](../../src/lib/ai/generate-with-min-length.ts)) — 본문 생성 = **Claude 기반**(OpenAI 아님). 최소 분량 가드 + expand 재시도 그대로.
- 발행 패턴 — generate-analysis 의 "임시 slug → create → ID 기반 slug update → PUBLISHED" 복제.

## 데이터 — 있는 것 / 없는 것

있음(메이저 리그 한정):
- xG + rolling xG 모멘텀 — `fixtureStats` JSON(af /fixtures/statistics, [home,away] 순서 고정), predictionEngine rolling-xg.
- 포메이션 + 그리드 포지션 + 감독 — 라인업 캐시(`lh.formation`, `lh.coach`, [grid-position.ts](../../src/lib/players/grid-position.ts)).
- 매치스탯 — 코너·슈팅 등 `MatchStats` 테이블([api-football-corners.ts](../../src/lib/sports/api-football-corners.ts)).
- 인시던트 타임라인 — 골·카드 시점.
- Elo·1X2·핸디/OU 예측 컨텍스트.

없음(MVP 제외 — 별도 데이터 소스 필요 = 진짜 "상" 난이도):
- 패스 네트워크, 히트맵, 샷별 위치맵, PPDA·압박 지표.

## 핵심 결정

1. **Pre-match vs Post-match** — MVP는 **Post-match(경기 후 전술 리뷰)** 권장.
   - 근거: 실측 xG·실제 뛴 라인업·실제 스탯 전부 확정 → 사실 밀도 최고 = SEO 유리. 프리매치 라인업은 킥오프 ~1h 전에만 떠서 타이밍 압박 큼.
   - Pre-match 전술 프리뷰는 2단계로 후행.
2. **얇은 AI글 = SEO 역효과** ([메모리 feedback_ai_visibility_seo]). 데이터 게이팅이 성패. 포메이션+xG 둘 다 있는 경기만 생성, 없으면 스킵.
3. **대상 리그** — xG+라인업 보장되는 EPL·LALIGA·BUNDESLIGA·SERIE_A·LIGUE_1·UCL 로 시작.
4. **발행 게이트** — 초기엔 `status: "DRAFT"` 로 만들어 수동 검수 → 품질 확인 후 자동 PUBLISHED 전환.

## Phase 1 검증 결과 (실측, 2026-07-10 prod DB)

게이트는 정확히 동작(통과/탈락 분리·사유 정확). **병목 = 라인업(포메이션) 커버리지**.
- xG 는 거의 전부 있음(시즌 중 60경기 중 48~60). `fixtureStats` 파이프라인 커버리지 넓음.
- 포메이션은 킥오프 직전 api-football 로 수집돼 **과거 경기 대부분에 없음**. 전체 380경기 중 통과는 EPL 24·LALIGA 38·SERIE_A 30·BUNDESLIGA 14·LIGUE_1 18·UCL 1.
- **시즌 중** 최근 60경기 기준으론 포메이션 EPL 25·LALIGA 38·SERIE_A 30 → 게이트 통과 ≈ **인시즌의 40~63%**. MVP 로는 충분(빅매치만 대상이므로 볼륨보다 품질).
- 지금(7월)은 유럽 비시즌 → **라이브 생성은 새 시즌(8월)부터**. MVP 는 지금 만들고, 지난 시즌 통과분(리그당 24~38경기)으로 검증 후 새 시즌에 라이브 가동.

### 파생 결정 필요 — 게이트 강도
- (A) 포메이션 하드 게이트 유지: 전술 깊이↑, 대상 인시즌 40~63% (권장 — 빅매치 품질 위주).
- (B) 포메이션 선택 + xG 만 하드 게이트: 대상 거의 전부, 대신 "포메이션 상성" 섹션 약화 → 일반 xG 리뷰에 가까움.

## 열린 질문

- 대상 경기 선정 기준: Elo 상위 맞대결 자동 + 라이벌전 수동 화이트리스트?
- 생성 빈도/한도(주 몇 편)? ANALYSIS 는 색인 유일 타입이라 양산 가드 존재 — 전술도 동일 가드 필요.
- 렌더: 순수 Markdown 으로 갈지, 포메이션 도식/xG 차트 카드(baseballContext 처럼 JSON prop)까지 얹을지.

## 첫 발행 (2026-09-05) — 아스톤 빌라 0-1 아스널 (#4600, `/articles/epl-tactical-4600`)

- 사용자 지시로 `--match=1160800` 단건 생성 → 검수 → PUBLISHED 전환. cron 은 여전히 `TACTICAL_ENABLED` OFF.
- **팀명 영문 노출**: 컨텍스트가 `homeTeam.name` 원문을 넣어 제목·본문이 "Arsenal" 로 나갔다 → `toKoreanTeamName` 주입(ANALYSIS 와 같은 교훈). 선수명은 사이트 표준대로 영문 유지.
- **홈/원정 수치 스왑 함정**: 같은 컨텍스트로 두 번 생성했더니 한 번은 "아스널 39%·빌라 61%"(틀림), 한 번은 "아스널 61%"(맞음). 데이터 블록은 정확했고 모델이 홈/원정을 뒤바꾼 것. 발행 전 원본(fixtureStats·matchStats)과 대조가 필수 — 자동화 전에 본문 숫자를 데이터와 기계 대조하는 게이트(점유율·xG·슈팅·코너 4종)를 넣어야 PUBLISHED 자동 전환이 안전하다.
- 프롬프트에 득점자·어시스트·교체 추측 금지, 한글 팀명 그대로 사용 규칙 추가. 첫 dry-run 에 "Havertz 가 마지막 슈팅에 관여했을 것으로 보인다" 류가 있었다.

## 전술 리뷰 v2 — 감독·한글 선수명·타임라인·선수 스탯·전술판 링크 (2026-09-05)

사용자 반려("감독 언급 없음, 선수명 전부 영문, /lineup 전술판을 활용하라, 진짜 전술 분석가처럼")로 재작업.
- 재료는 전부 `TheSportsMatchCache` 에 이미 있었다. `lineup`(coach_id·좌표·등번호·평점), `detailLive.incidents`(골·도움·교체·카드·VAR), `playerStats`(평점·키패스·태클·듀얼·드리블·빅찬스). `src/lib/tactical/ts-enrich.ts` 가 이걸 한글 텍스트 블록 + 이름→경로 링크 목록 + `/lineup?d=` 보드 코드로 만든다.
- 선수 한글명 우선순위는 **위키 사전(toKoreanPlayerName) → TheSportsPlayer.nameKo → 영문**. DB nameKo 는 야간 봇 음역이라 "니콜라 작송"(Nicolas Jackson)·"즈올리스"(Tzolis) 같은 오기가 섞여 있었고 사전은 정확했다. 사전 미매핑은 원문을 그대로 돌려주므로(음역 안 함) 안전.
- 감독은 `lineup.coach_id` → coach-photos.json(nameKo) → coach-page-link 로 링크. 라이브 라인업 카드와 같은 경로.
- 이름 링크는 LLM 에 맡기지 않고 **후처리(linkNamesInMarkdown)**: 등재된 선수·감독만, 첫 등장 1회, 제목·리드·기존 링크 제외, 긴 이름 우선 단일 스캔(짧은 이름이 긴 링크 텍스트 안에서 재매칭되는 것 방지).
- `/lineup?d=` 보드는 versus 모드·실좌표. 좌표 규약은 LineupBuilder.placeY 와 동일(홈 아래 50+y·0.46, 원정 위 50−y·0.46, ts y 는 자기 골문 0 이라 100−y 로 뒤집고 원정 x 미러). 실렌더 확인 — 양 팀 11명·한글명·감독 두 명 표시.
- 프롬프트는 rich 데이터(타임라인·선수 스탯)가 있을 때 7단 구조(한 줄 요약/두 감독의 셋업/볼을 가졌을 때와 잃었을 때/경기를 바꾼 장면들/숫자가 가리킨 선수/감독의 수/총평)로 바뀌고 2,400~3,200자. 없으면 기존 5단.
- `--update=<articleId>` 플래그: 기존 글 본문만 교체(slug·status 유지). #4600 재생성 5,255자·링크 41명.
- **재생성본 팩트체크에서 오류 3건**: 바클리 슈팅(데이터엔 마트센·매긴만), VAR 결과 단정("골 불인정" — var_result 의미 불명), 빌라 최근 전적(LWWDL=2승1무2패를 1승2무2패로). 재생성 대신 문장 단위로 DB 직접 교정. **자동 발행 전 숫자 대조 게이트가 여전히 필수** — 이번엔 폼 문자열 집계·개인 스탯 귀속·인시던트 결과 해석 3종이 새 오류 유형.

## 본문 전술 도식 (2026-09-05, 사용자 캡처 요청 — 유튜브 전술 채널식 "형태 겹치기")
- `components/tactical/TacticalShapeFigure.tsx`: 공용 Pitch/PitchMarker 위에 한 팀 셋업(색 마커+역할 약어+한글명, 라인별 폴리라인)과 상대 형태(흰 마커, 미러링)를 겹친다. 연결선 SVG 는 Pitch 마킹과 같은 viewBox·`xMidYMid meet` 규약이라 마커(%)와 정확히 겹친다(`preserveAspectRatio="none"` 금지 규칙 준수).
- 본문 삽입은 토큰 `{{tactical-shape:home|away}}` — 잡(decorate)이 "## 두 감독의 셋업" 섹션 끝에 끼우고, 글 페이지가 토큰 자리에 도식을 렌더한다. 도식 데이터가 없으면 토큰만 지운다. metadata description 에서도 토큰 제거.
- **ts 좌표 함정**: ts x 는 "아래로 공격하는 화면" 기준(SoccerLineupSvg 헤더 규약). 위로 공격하게 그리면 left%=100−x 여야 한다 — 그대로 쓰면 매티 캐시(RB)가 LB 자리에 찍힌다(실측 후 수정). 역할 판정(LB/RB·LW/RW)도 팀 기준 좌우로 뒤집어 넣는다. /lineup 보드 코드도 같은 수정(홈만 x 뒤집기).
- 미드필더 연결선은 DM·CM 과 AM·LM·RM 두 그룹으로 나눈다. 한 줄로 이으면 4-2-3-1 이 W 자 지그재그가 된다.
- 역할 약어는 좌표 임계값 근사(x<33 LB 등). 3톱 미드필더의 바깥 둘이 AM 으로 뜨는 정도의 오차는 남는다.

## K리그1 확대 — "K리그 이주의 전술 분석" (2026-09-09)

목표. 빌드업 등 경쟁사가 못 다루는 K리그 전술 분석 틈새를 자동 글로 선점. 기존 매치 단위 TACTICAL 파이프라인을 K리그1 전 경기로 확대하고, 라운드 직후 자동 발행한다.

### 데이터 실측 (prod, 최근 45일 K리그1 종료 47경기)
- **xG 0건, fixtureStats 5건, af 포메이션 19건** — 기존 게이트(af 포메이션 + xG)로는 전 경기 탈락.
- **ts 캐시 47/47**: `home_formation/away_formation`·`detailLive.incidents`(16~24건/경기)·`lineup` 좌표·`coach_id` 전부 있음. 매치스탯(점유·슈팅)은 9/47 만.
- **ts `playerStats` 는 껍데기** — 40행이 있지만 rating 이 전부 `0.0` 이고 패스·태클 등 지표가 없다. 그대로 넣으면 "평점 상위 서명광 0.0(90분)" 같은 줄이 프롬프트에 들어가 모델이 "평점 0.0" 을 서술할 위험 → rating ≤ 0 은 결손(null)으로 처리하고, 실지표가 하나도 없으면 [선수 스탯] 블록 자체를 내지 않는다.
- 선수 한글명은 위키 사전 미매핑이지만 `TheSportsPlayer.nameKo`(조현우·이동경·문선민…)가 정확히 나온다. 감독(김현석·김기동)도 coach-photos 경로로 정상. 링크 40명·전술판 코드·도식 2개 생성 확인.

### 결정
1. **게이트 분기** — `TS_TACTICAL_LEAGUES = {K_LEAGUE_1}` 는 xG 대신 **ts 양 팀 포메이션 + 타임라인 존재**를 하드 게이트로 쓴다. 빅5 게이트는 그대로(변경 없음). 근거. K리그 전술 리뷰의 재료는 "두 감독의 셋업 · 교체 타이밍 · 골 장면"이고 이 셋은 ts 에 전부 있다. xG 부재는 프롬프트에 명시해 언급을 막는다.
2. **프롬프트 조건부** — `hasXg`·`hasPlayerStats`·팀 스탯 유무에 따라 섹션·규칙을 뺀다. "숫자가 가리킨 선수" 섹션은 선수 스탯이 있을 때만. 없는 데이터에 대한 섹션을 남기면 모델이 채워 넣는다(창작 = 이 프로젝트의 1번 금지). 분량은 스탯 없는 경기 1,800~2,400자(2,400~3,200 은 재료 대비 과다 → 얇은 반복문).
3. **자동 발행은 K리그1 만, 팩트 게이트 통과 시** — 9/05 노트가 "자동 발행 전 숫자 대조 게이트 필수"라고 적었고, 이번이 첫 자동 발행이므로 결정적 대조 4종을 넣는다. (a) 제목에 영문 4자+ 단어 금지, (b) 본문에 실제 스코어 표기 존재, (c) 본문의 `N분`·`N'`·`전반/후반 N분` 이 타임라인(m, m−45, 추가시간)·출전시간 집합 안에 있는가, (d) 본문의 `N%` 가 데이터 텍스트에 있는가. 탈락은 **DRAFT 로 남기고 사유 로그** — 버리지 않는다. 빅5 는 여전히 DRAFT(기존 결정 유지).
4. **실행 위치 = Vultr systemd 타이머(매일 11:00 KST)**, Vercel cron 아님. 근거 3개. Vercel `/api/cron/tactical` 은 `TACTICAL_ENABLED` OFF 라 켜면 빅5 DRAFT 까지 함께 양산된다. 함수 300s 한도에 라운드 6경기(편당 1~2분)가 안 들어간다. 워커 유닛 정본이 어제 `vultr-worker/job-units/` 로 편입돼 배포 경로가 확정됐다. 11:00 은 기존 타이머(09:40·10:30·12:30)와 겹치지 않는 슬롯 — 같은 repo 에서 `git reset --hard` 를 하므로 시각 충돌은 git 락 사고가 된다(메모리 macmini-launchd-git-lock-collision).
5. **"라운드 직후"의 구현 = 매일 실행 + 3일 lookback + 경기별 중복 스킵.** K리그 라운드는 금·토·일 분산(가끔 수요일)이라 라운드 종료 이벤트를 따로 감지하는 것보다 매일 아침 전날 경기를 전부 처리하는 게 단순하고 빠르다. 리그 전용 cap 6(한 라운드 최대 경기 수).
6. **시리즈 라벨은 결정적 후처리** — H1 아래 `*K리그 이주의 전술 분석 — K리그1 N라운드*` 한 줄을 잡이 삽입. 라운드는 af `raw.league.round`("Regular Season - 28") 끝 숫자. LLM 제목은 그대로(SEO 제목 길이 보존).
7. URL 확인 — K리그1 리그 페이지는 `/leagues/k_league_1`(요청문의 `kleague1` 은 404). 글은 `league=K_LEAGUE_1` 로 저장되면 그 페이지 분석 탭(ANALYSIS+TACTICAL 합산)에 기존 로직으로 자동 노출.

### 첫 실발행 실측 (2026-09-09 08:35~08:45 KST, Vultr 수동 3회)
- 대상 4경기(27R 김천-광주·안양-강원, 28R 인천-부천·울산-서울) 전부 생성. 최종 **4편 PUBLISHED** (#4804·#4805·#4808 자동, #4807 게이트 완화 후 수동 전환). 편당 60~90초, 3,800~5,200자, 선수 링크 60여 명, 도식 2개·전술판 링크 정상 렌더. 리그 페이지 `?view=articles&type=analysis` 에 즉시 노출(force-dynamic).
- **게이트가 잡은 진짜 오류** — #4803 "후반 50분부터 시작된 체계적인 변신"(타임라인에 50분 없음). 재생성본 #4807 은 같은 자리에 "후반 70분대"로 썼다. 창작 분은 이 모델이 반복하는 유형이라 분 대조는 유지.
- **게이트 오탐 2종 수정** — (1) 원정 승을 "3-0 승리"로 쓴 정상 글이 홈 기준 "0-3" 검사에 탈락 → 양 순서 허용. 스코어로 홈/원정 스왑을 잡는 건 원리상 불가하니 그 역할은 분·퍼센트 대조에 맡긴다. (2) "후반 70분대 교체"(69'·76' 를 뭉뚱그린 범위 표현) 를 시각으로 오판 → "분대" 를 "분간·분 동안" 과 같은 제외군에 넣음.
- **프롬프트 보강 2건** — 리드에 스코어 숫자 강제("3골" 표현만으론 게이트 스코어 검사 통과 불가 — 프롬프트와 게이트가 같은 규칙을 봐야 한다). [최근 폼] 원문 "DWLLL" 이 산문에 그대로 박힌 사례 → 풀어쓰기 규칙 + 게이트 `[WDL]{3,}` 토큰 차단.
- **운영 함정 2건** — (1) 첫 실행 닭-달걀: sh 가 repo 안에 있는데 서버 repo 가 pull 전이라 "can't open input file". 새 워커 sh 는 유닛 enable 전에 서버 repo 를 한 번 `git reset --hard origin/main` 해야 한다(다른 일일 잡이 돌면 자동 해소되지만 첫날은 수동). (2) sh 가 실행 도중 자기 자신을 `git reset` 으로 교체하면 그 회차는 옛 파이프라인으로 끝난다 — 3회차 로그가 정확히 옛 `tail -20` 20줄이었다. sh 수정 직후 1회는 옛 동작으로 보이는 게 정상.
- 선수명: 위키 사전 미매핑이 대부분이지만 `TheSportsPlayer.nameKo` 로 거의 전부 한글화. 미등재 외국인(Abdelkarim Chaouche·Blaise tsague·Eun-Seok Ko) 은 영문 그대로 본문에 나간다 — 제목만 게이트가 막는다. 잠금 사전 등재는 player-name-lock-sweep 경로.
