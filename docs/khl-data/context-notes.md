# KHL 데이터 온보딩 — 컨텍스트 노트

## 권한이 바뀌었다 — 8월 메모리는 낡았다
8/16 온보딩 때 "하키 season/table 미인가"로 적었는데 9/18 실측에서 `season/table/detail` 이 열렸다.
그래서 정규리그 순위를 DB 자체 산출이 아니라 공식 표로 낼 수 있다. 다른 유럽 하키 리그도 같은 경로로 붙는다(시즌 id 한 줄).
여전히 닫힌 것. `season/recent/table/detail`·`season/table`·`stage/list`·`competition/list`·`player/stats`·`season/player_stats/list`·`team/stats/list`·`match/season/recent`.

## KHL 승점 체계
승(정규·연장·승부치기 모두) 2점, 연장·승부치기 패 1점. 표의 `win` 은 연장·승부치기 승 포함, `loss` 는 정규 패만
(SKA: total 6 = win 5 + loss 1, overtime_win 2 포함, points 10 = 5×2). 화면은 승 / 연장·승부치기 승 / 패 / 연장·승부치기 패 로 나눠 보여준다.

## 표가 7개 — 전체 1 + 컨퍼런스 2 + 디비전 4
이름으로 분류한다. "Conference" → 컨퍼런스, "Division" → 디비전, 그 외(KHL 26/27) → 전체. 기본 노출은 전체 표, 그 아래 컨퍼런스·디비전.

## 선수 기록은 시즌 API 가 없어 경기 캐시로 집계
ice-hockey-poller 가 KHL 경기 detail_live 를 이미 캐시하고 있었다(종료 40경기 전부 players 보유). stat 코드는 HockeyBoxScore 와 같다
(20=1골리/2스케이터, 26골, 27도움, 56+/-, 28유효슛, 23TOI초, 24세이브, 25SV%). 골리 SV% 는 경기별 %를 세이브 수로 가중 평균한다.
선수→팀은 캐시의 home/away 쪽 + Match.homeTeamId/awayTeamId 로 정한다(이적 시 최근 경기 기준).

## 선수 이름
ts 는 영문만 준다. NHL 선례(build-nhl-player-names-haiku)대로 Haiku 음역. 러시아 이름은 영문 표기가 이미 로마자라 오역 위험이 팀명보다 낮다.
json 은 data/khl-players.json 하나에 프로필+한글명을 같이 둔다(로스터·리더보드·라이브 이름이 모두 이 파일을 본다).

## 함정 — ice_hockey 국가 id 는 축구 country-list.json 과 다르다
첫 빌드에서 국적 0건. 러시아가 축구 목록엔 없는 `kp3glrwdb5qdyjv` 였다. `/v1/ice_hockey/country/list` 를 실행 때 받아 푼다.
같은 이유로 선수 사전에 `natId` 를 저장해 두고 국적명은 매 실행 재해석한다(사전 갱신 없이 표기만 고칠 수 있게).

## 라이브 상세 주소는 Match.id 가 아니라 externalId
`/live/KHL/11771933` 은 404 다. /scores 카드가 거는 주소는 `/live/KHL/ts-{externalId}`. 검증할 때 헷갈리지 말 것.

## 하키 허브 Top3 는 승점이 아니라 승수
LeagueBlock 미리보기가 "N승" 라벨을 붙이므로 KHL 도 승수(연장·승부치기 승 포함)를 넣었다. 순서는 공식 표 순위 그대로.

## 팀 한글명 22건은 손으로 넣었다
Haiku 자동 생성 금지 원칙(친선 249팀)은 유지. KHL 22팀은 국내 매체 표기가 정착돼 있어 `HOCKEY_CLUB_OVERRIDES` 에 직접 적었다 — 하키 전 리그가 공유하므로 CHL·친선에서도 같은 이름이 붙는다.

## 부상자 — 재료가 없어 "걸어만 둔다"
TheSports `team/injury/list` 는 열려 있지만 22팀 전부 빈 배열(9/18). ESPN 은 KHL 미커버, khl.ru 는 뉴스뿐이고 자동 추출 금지 약관.
그래서 주간 빌드가 매번 조회해 json 에 싣고, 팀 페이지는 있으면 배지를 붙이는 구조로만 뒀다. 부상 원본 구조를 못 봐서 `raw` 를 그대로 저장하고
라벨은 reason/type/injury/description 순으로 뽑는다 — 실데이터가 들어오면 그때 필드를 확정할 것. "0건 = 부상자 없음"으로 읽지 말 것.
