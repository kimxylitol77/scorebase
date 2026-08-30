<!-- competitor-watch / competitor-backlog 봇이 "이미 scorebase 에 있는 기능"을 정확히 가려내기 위한 참조 인벤토리. 새 기능 추가 시 갱신. -->

# scorebase 기능 인벤토리 (경쟁 분석 참조용)

> **기준 시점 2026-08-30.** 여기 적힌 것은 전부 프로덕션(www.scorebase.kr)에 배포돼 있고 코드로 확인된 것이다.
> 브랜치에만 있는 미배포 작업물은 적지 않는다. 경로(`/...`)는 실제 페이지 주소다.

## 정체성

- 한국향 **AI 스포츠 미디어** — scorebase.kr. 매일 매치 데이터를 자동 수집·분석·글 발행. 한국어 콘텐츠, 한국 사용자 타깃.

## 반복 오탐 주의 — 아래는 전부 이미 보유. 새 아이디어로 내지 말 것

- 경기 예측 공개 성적표·누적 적중률 대시보드 → `/predictions/accuracy`
- 여러 AI 모델을 같은 경기로 겨루는 비교 성적표 → `/predictions/scorecard`
- 오늘의 AI 픽 자동 선별 → 경기 후 공개 채점 → 누적 성적 → `/picks/strong`
- 예측 기록 잠금(킥오프 후 수정 불가)·공개 추적 → `/picks` + `/picks/me`
- 시즌 우승·강등 확률 시뮬레이션 → `/predictions/[league]`
- 경기 데이터로 답하는 자연어 AI 챗봇 → 경기 상세 플로팅 챗
- KBO 라이브스코어·선수 스플릿 → `/live/kbo/[gameId]`, `/players/[pid]` 스플릿 탭
- 모델 vs 시장(배당) 성적 비교·수익 시뮬 → `/predictions/accuracy`, `/picks/me`

## AI 예측·픽 (핵심 차별점)

- **5종 시장 예측**: 1X2·오버언더·핸디캡·BTTS·더블찬스. Elo(FiveThirtyEight MoV) + 시장 배당 블렌드.
- **적중률 실측 공개** — `/predictions/accuracy`: 15개 리그(빅5·MLS·UCL·UEL·UECL·NBA·NHL·MLB·KBO·NPB·LOL) 1X2/OU/핸디 + 누적 추이 + 신뢰도 곡선 + **모델 vs 시장 맞대결·플랫 1유닛 ROI**.
- **멀티 AI 성적표** — `/predictions/scorecard`: 자사 정량모델 vs GPT·Claude·Grok·Gemini·Qwen·Kimi 를 경기 전 픽으로 저장해 채점하는 리더보드 + 다가오는 경기 전 모델 픽(AI 원탁).
- **고확신 픽** — `/picks/strong`: 마켓별 차등 임계(1X2·OU 0.80 / 핸디·더블찬스 0.65)로 매일 자동 선별, 종료 후 자동 채점, 일자별 적중 14일 누적. 회원 공개.
- **시즌 시뮬** — `/predictions/[league]` 몬테카를로 우승·강등·순위 확률, `/predictions/title-race` 전 리그 우승 경쟁, 월드컵 토너먼트 시뮬 + 우승확률 추이 곡선.
- 종목 보정: MLB/KBO/NPB 선발투수(ERA·WHIP·K9), NHL 골리(GAA·SV%). 선발 매치업 보드 `/predictions/starters`.
- 랭킹: `/predictions/fifa-ranking`(+여자), `/predictions/club-ranking` 세계 클럽 랭킹 150.

## 배당·마켓

- `/odds` — 종목별(축구·야구·농구) 배당 흐름(line movement) + **노-빅(마진 제거) 계산기**.
- `/value-bets` — 모델 확률 vs 배당사 implied 비교, value>+5% 목록 + **켈리 비중** 정렬.
- `/over-under` — 축구 전 리그 오버 2.5 비율 허브.
- 야구 3리그 매치 상세에 **오프닝 배당 유사경기 카드**(비슷한 오프닝 배당 과거 경기의 실제 결과 분포).
- 픽 시점 배당·종가 저장 → **CLV(종가 대비 가치)** 와 플랫 1유닛 수익 시뮬 (`/picks/me`).

## 라이브·경기 데이터

- `/scores` 통합 라이브 스코어(리그 그룹 카드, 즐겨찾기 별표, 라인업 확정 L 배지), 별도 라이브 전용 화면 `/board`.
- 매치 상세 — 축구/농구/하키 `/live/[league]/[gameId]`, 야구 `/live/{kbo|mlb|npb}/[gameId]`, e스포츠 `/live/lol/[matchId]`, UFC.
- 매치 안에: 승률 도넛·xG·모멘텀·H2H·**샷맵**·골 리플레이·전반 통계·주심 카드 지표·**공식 유튜브 하이라이트 임베드**(K리그·NBA 종료 경기)·요약 카드.
- 라인업 — 확정 라인업 + **예상 라인업(클럽 XI 크론)**, MLB/KBO/NPB 선발, NHL 골리.
- 화면 밖 시청 — **떠 있는 미니 스코어(PiP)**, 즐겨찾기 경기 고정.

## 순위·리그·팀·선수

- `/standings` 허브 + `/standings/[league]` — 축구 다수 + 야구·농구·하키·배구·e스포츠.
- `/leagues/[league]` 리그 탭 — 순위 · **파워랭킹** · 일정(라운드 네비) · 통계(**리그 리더보드**) · 역사(역대 우승) · 글, 컵은 **대진표** 탭.
- `/teams/[id]` 팀 페이지 — 로스터·구단 정보·경기장·일정·**팀 역사**·최근 라인업·이적, `/teams/[id]/vs/[oppId]` 및 `/h2h/[pair]` 상대전적.
- 선수 — 야구/농구/하키/LOL `/players/[pid]`(개요·시즌기록·경기·스플릿 4탭, MLB 는 투구존·스프레이·구속 차트·퍼센타일), 축구 `/transfers/[id]`(몸값 추이·이적 기록·경력·**경기별 히트맵 분석**).
- `/compare` 선수 1:1 비교, `/search` 팀·선수·리그·기사 통합 검색.
- `/injuries/[league]` 부상자 명단, `/transactions/[league]` NBA·MLB·NHL 트랜잭션 피드, `/coaches/[id]` 감독 프로필.
- `/transfers` 이적시장 — 시장가치 랭킹 + **이적 임박·루머 단계 피드**(Tier1 소스 검증 게이트).

## 회원·커뮤니티·게임

- **승부예측 투표** `/picks` — 원클릭 픽, **킥오프 이후 투표·변경 불가(기록 잠금)**, 나 vs AI 대결. `/picks/me` 내 리포트(적중률·리그별·월별·CLV·수익 시뮬).
- `/experts` 예측 전문가·회원 적중 랭킹(Wilson 하한 정렬).
- `/analysis` 스포츠 분석 게시판 — 회원·봇 승부예측 글 + **적중 자동 채점** + 댓글, 자유게시판 통합(`?board=free`).
- `/lab` **회원 커스텀 예측 봇** — 손잡이 5개로 모델 조립, 즉석 백테스트·경기 시뮬·봇 저장, 봇이 매일 픽 자동 생성·채점.
- `/dream-team` 드림팀 빌더·판타지·유저 대전·리더보드, `/lineup` 라인업 전술판(이미지 카드 공유), `/career` 선수 인생 시뮬 게임.
- **알림** — 웹 푸시(킥오프 15분 전·선발 라인업 발표·경기 종료) + 텔레그램 개인 알림(즐겨찾기 팀·경기, KICKOFF·LINEUP·GOAL·FINAL). PWA 설치 안내 `/app`.
- 경기 상세 **AI 챗봇**(회원) — 그 경기 데이터로 답하는 플로팅 챗. `/account/shop` 포인트 상점(닉네임 색·아바타 프레임).

## 콘텐츠 (자동 생성)

- **PREVIEW**(경기 전)·**RECAP**(경기 후)·**ANALYSIS**(심층)·**TACTICAL**(경기 후 전술 분석) 자동 글 — Claude 작성, `/articles/[slug]`·`/previews`.
- 주간물 — 축구 빅5 주간 리뷰, 야구 주간 리그 리뷰, 리그 주간 베스트 XI·MVP, 이적시장 위클리 블로그, 이적 데일리 다이제스트.
- `/news` 해외 뉴스 브리핑(BBC·Sky·Athletic·ESPN·리그 공식 RSS → 사실 재구성), `/blog` 데이터 블로그, `/notices` 패치노트.
- 월드컵 `/world-cup` 허브(조별·예측·선수·xG), 조별 베스트11, 오늘의 베스트11 자동 발행.

## 도구·부가 페이지

- 승리확률 계산기 `/tools/{kbo|mlb|npb}-win-probability`, `/baseball/statcast` MLB 타구질 리더보드, `/soccer/sub-impact` 교체 임팩트, `/ballon` 발롱도르 지수 계산기.
- 연봉 `/salaries/{soccer|mlb|kbo|nba|nhl|golf|tennis|f1}`, 랭킹 `/rankings/{value-clubs|tennis|f1|ufc}`, `/soccer/korea` 해외파 한국 선수, `/golf/korea` 한국 선수 트래커, `/tennis/draw` 대진표.
- 종목 허브 `/soccer` `/baseball` `/basketball` `/hockey` `/other`.

## 종목·리그·채널

- 노출 리그 코드 **246개**(ALL_LEAGUES, 표시 전용 포함) — 축구(빅5·유럽 2부·남미·아시아·컵·여자), 야구(KBO·MLB·NPB·CPBL·퓨처스 등 12), 농구(NBA·WNBA·KBL·WKBL), 하키(NHL·KHL 등 유럽 9·오세아니아), 배구(V-리그·VNL 등), e스포츠(LCK·LEC·LCS·LPL), UFC, 테니스·골프·F1(표시 전용).
- 영어판 `/en` — 스코어·순위·예측·적중률·성적표·이적·부상·연봉·선수/팀 미러.
- **임베드 위젯** `/widgets`(외부 사이트용 iframe), **방송 오버레이 스코어보드** `/embed/scoreboard`(OBS 브라우저 소스), 월드컵 대진표 위젯.
- SEO·신뢰 — internal linking, AI 협업 명시(AiDisclosure), 외부 권위 출처(nofollow), JSON-LD(NewsArticle+SportsEvent), GSC 추적, AI 학습봇 차단, 인용 박스(CiteBox).

## 알려진 약점·미보유 (저들에 있고 우리에 없는 것 판단 기준)

- 선수 이름 한글화 부분적 — 영문 잔존(특히 마이너·하부리그).
- 축구 좌표 데이터는 리그·시즌 커버리지 제한 — 샷맵·히트맵은 있으나 패스망은 없음.
- 네이티브 모바일 앱 없음(PWA 설치 안내만). 자체 영상 제작·하이라이트 편집 없음(공식 유튜브 임베드만).
- 경기별 실시간 팬 채팅방 없음(경기 챗은 AI 1:1, 사용자끼리는 게시판 글·댓글만). 현금 결제·유료 구독 없음(포인트 상점만).
- 공개 텔레그램 방송 채널 미개설(코드는 완료, 1:1 알림만 가동).
