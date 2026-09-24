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
