# LoL 통산 데이터 활용 (2026-09-24)

## 계기
"배구·LoL ts 구독 중인데 선수 데이터 더 뽑을 수 있는 것 뽑아줘."

## ts 인가 범위 재실측 — 네임스페이스가 핵심
9/23 메모(`ts-player-stats-authorization`)는 "e스포츠 player/list 미인가"였는데, 그건 `/v1/esports/*` 를 찔러본 결과였다.
**LoL 은 `/v1/lol/*` 네임스페이스에서 열린다.** `/v1/esports/*` 는 전부 미인가.

| 엔드포인트 | 상태 | 비고 |
|---|---|---|
| `/v1/lol/player/list` | 인가 | 이미 사용(build-lol-players) |
| `/v1/lol/hero/list` | 인가 | 이미 사용(build-lol-heroes) |
| `/v1/lol/team/list` | 인가 | 1,829팀 |
| `/v1/lol/player/stats/list` | 인가 | **미사용이었음** — 38,538행·6,423명 |
| `/v1/lol/team/stats/list` | 인가 | **미사용이었음** — 6,605행·1,321팀 |
| `/v1/lol/tournament/list` | 인가 | 미사용(827개, 로고·커버) |
| `/v1/lol/stage/list`·`country/list`·`match/diary` | 인가 | 미사용 |
| `/v1/lol/season/list`·`competition/list`·`match/recent/list`·`match/analysis` | 미인가 | |
| 배구 `player/list`·`player/stats`·`team/squad`·`injury`·`transfer` | **전부 미인가** | 배구는 선수 데이터가 원천적으로 없다 |
| 배구 `season/list`·`team/list`·`country/list`·`category/list`·`match/diary`·`season/table/detail` | 인가 | 팀 로고·일정·순위 (워커가 이미 사용) |

## 행 구조 — 통산 1행 + 최근폼 5행
선수·팀 모두 `match_count` 가 구간 식별자다. `0` = 통산(데뷔 이후 누적), `10·20·30·40·50` = 최근 N경기.
`player_id` 파라미터는 무시되므로 전 페이지를 순회해 클라이언트에서 거른다.

## 붙인 것
- `scripts/build-lol-career.ts` → `data/lol-career.json`. 선수 60/60 통산 확보, 팀 28개.
- `scripts/build-lol-heroes.ts` 에 `byId` 색인 추가 — `common_heros` 가 챔피언 id 로 오는데 기존 파일은 이름 키였다(기존 `heroes` 키는 그대로 둬서 기존 사용처 무영향).
- 선수 페이지 **통산 탭** — 통산 전적·KDA·킬 관여율·분당 CS/골드/대미지 + 최근 10~50경기 폼 표 + 통산 챔피언 풀 10종(로고·판수·승률).
- 팀 페이지 **오브젝트·교전 지표** — 퍼블·첫 타워·첫 드래곤·첫 바론 선취율, 경기당 킬, 평균 경기시간.

## 함정
- **팀 id 다리.** LCK `Team.externalId` 는 ts id 가 아니라 자체 번호("1","8")라 그대로 매칭하면 LCK 0/10 이다.
  `Match.lolGames` 의 세트마다 `red`/`blue` 가 `{id: ts팀id, name}` 을 들고 있어 이름으로 우리 Team 과 잇는다 → LCK 10/10.
  JSON 은 **우리 Team.id 키**로 저장해 읽는 쪽이 ts id 를 몰라도 되게 했다.
- **프록시 절단.** 26페이지 근처에서 ECONNRESET. 페이지 단위 4회 재시도 + 400ms 간격 필수.
- **포지션 코드.** 1 원딜 · 2 미드 · 3 탑 · 4 정글 · 5 서폿 (실측: Gumayusi·Peyz=1, Zeus·Doran=3, Oner=4).
  `src/lib/sports/esports/stats-data.ts` 가 1=TOP·3=JGL·4=ADC 로 반대로 매핑해 `/esports/stats` 포지션 열이 틀려 있었다 → 수정.

## 남은 후보
- `tournament/list` 로 대회 로고·커버 — 리그/대회 페이지 비주얼.
- 선수 사전(60명)을 ts `player/list` 의 우리 팀 소속 전원으로 확장.
- 팀 메타 지표 LEC 10/19·LCS 8/15 — 나머지는 lolGames 미수집 팀이라 경기가 쌓이면 자동 연결된다.

## 대회 로고 (2026-09-24 2차)

`/v1/lol/tournament/list` 827개 전부 로고·커버 보유. `scripts/build-lol-tournaments.ts` → `data/lol-tournaments.json`
(로고 827/827. `prize_pool: "0"` 은 미공개라 안 싣는다 — 0달러로 보이면 오보).

**연결은 이미 돼 있었다.** 수집기 변경이 필요 없다 — `Match.raw` 에 `tournament_id` 가 들어 있다.
2026 커버리지 실측: LOL 226/226 · LEC 106/106 · LCS 71/71 해석. LPL 은 수집 경로가 달라 `tournament_id` 0건.

**왜 가치가 있나.** 우리 리그 코드 하나에 서로 다른 대회가 섞인다.
`LOL` = LCK 2026(148) + LCK Cup 2026(40) + KeSPA Cup 2026(38) 인데 화면엔 전부 "LCK"로만 보였다.

**붙인 자리 두 곳.**
- `/live/lol/[matchId]` 헤더 — 대회 배지(로고 + 이름). 기존 "LCK · 시리즈 점수 자동 갱신" 을 대체.
- `/leagues/{LOL,LEC,LCS}` 허브 — "올해 대회" 줄. 최근 경기 순 정렬, 대회별 경기 수 표기. 1시간 캐시.

**미해결(별건).** `src/app/live/lol/[matchId]/page.tsx:211` 이 `matchId={Number(matchId)}` 로 넘기는데
LoL 라우트 파라미터는 ts 문자열 id("xwrx81u3wkkjqyk")라 항상 `NaN` → 매 페이지 로드마다
`/api/live/lol/NaN` 400. 인게임 패널이 뜬 적이 없다는 뜻. 커밋 55aacc65 부터의 기존 버그라 별도 처리.

## 선수 사진 전 리그 확장 (2026-09-24 3차)

**문제.** 사전 `data/lol-players.json` 이 60명뿐이라 사진이 58/180 (32%) 였다.
원인은 `build-lol-players.ts` 가 `where: { league: "LOL" }` 로 LCK 만 훑은 것 — LEC 57명·LCS 44명이 통째로 0명,
LCK 안에서도 79명 중 60명만 들어와 있었다.

**고친 것.**
- 대상 리그를 LOL/LEC/LCS/LPL 로 확장.
- 수집 방식을 `player/list?uuid=` 선수당 왕복 → **전량 순회 1회 색인(8,894명)** 후 대조로 교체. 못 찾은 선수만 uuid 보충.
- 기존 사전을 보존하고 덮어쓰기만 한다 — 한 번 실패한 선수의 사진을 잃지 않게(NBA 사전 사고와 같은 교훈).
- `position`·`birthday` 는 ts 타입 선언이 string 인데 실제는 숫자라 강제 변환.

**결과.** 프로필 180/180 · 사진 167/180 (93%). 나머지 13명은 ts 에 사진이 없다.
통산 사전도 재생성해 179명으로 늘었다(LEC·LCS 선수도 통산 탭이 열린다).
사전을 읽는 15개 소비처(스탯 표·선수 페이지·팀 로스터·리더보드·비교·영어판)가 한 번에 같이 좋아진다.

**곁가지 2건.**
- 포지션 미상(null) 선수가 생기며 JSON 추론형이 바뀌어 소비처 4곳의 `position?: number` 가 깨졌다 → `number | null` 로 전수 수정.
- LEC·LCS 선수 페이지가 전부 "LCK" 라벨·`/leagues/LOL` 링크였다(기존 버그, 사진이 붙으며 눈에 띔).
  `getLolPlayerDetail` 이 세트가 가장 많은 리그를 돌려주게 해 라벨을 맞췄다 (Caps→LEC · Zven→LCS · ShowMaker→LCK).

**남은 것.** 영어판 `src/app/en/players/[pid]/LolViews.tsx` 는 여전히 "LCK" 하드코딩이고 통산 탭도 없다.
en-mirror 재생성이 필요해 별건으로 둔다.
