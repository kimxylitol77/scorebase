# 유럽 하키 리그 온보딩 — 컨텍스트 노트

작업 중 내린 결정과 근거. (2026-08-16, 클럽 친선 온보딩 직후)

## ts `unique_tournament/list` 가 열린다 — 대회명을 짐작하지 않는다

기존 메모리에는 하키 `competition/list` 미인가만 적혀 있었다. 실제로는
**`/v1/ice_hockey/unique_tournament/list?page=N` 이 열린다** (375개 대회, 이름·국가·로고 포함).
`country/list` 도 열린다(213건).

친선 온보딩 때는 utid 를 팀 구성으로 역추적했는데, 그럴 필요가 없었다. 이번엔 공식명으로 대조했고
추정이 두 건 틀렸다 — 체코 2부는 `1.liga` 가 아니라 **Chance Liga**, 벨라루시 컵은 "벨라루시안컵"이 아니라 **Salei Cup**.
새 하키 대회를 붙일 땐 항상 이 endpoint 로 이름을 확정할 것.

## 범위 — 각국 최상위 + 사용자가 지목한 컵 2개

sweep 에 19개 대회가 잡혔고 그중 9개만 붙였다. 뺀 기준은 J3 제외 선례와 같다.
2부(Chance Liga·Mestis·Slovak 1.Liga)·유스(Swiss U21·U20 친선)·여자(SDHL·EHT Women)는 제외.
경기 수가 적지 않은 Chance Liga(24경기)도 뺐다 — "2부는 붙이지 않는다"를 일관되게 지키는 쪽이
리그별로 그때그때 판단하는 것보다 낫다고 봤다.

## Team.league 라벨 — 정규리그는 갱신, 대항전·컵은 TeamSourceId 만

친선 시드로 만든 249개 Team row 는 `league="HOCKEY_FRIENDLY"` 다. 이 팀들이 KHL 매치를 갖게 되면
라벨이 실제 소속과 어긋난다 ([[team-league-label-rollover]] 가 지적한 유형 — 30개+ 파일이 이 라벨을 읽는다).

그래서 이렇게 나눴다.

- **정규리그 6개**(KHL·Liiga·스위스NL·체코·슬로바키아·덴마크) — 소속 팀의 `Team.league` 를 그 리그로 갱신.
  팀의 주 소속이 명확하기 때문.
- **대항전·컵 3개**(챔피언스 하키 리그·카자흐스탄컵·살레이컵) — `TeamSourceId` 만 추가하고 라벨은 건드리지 않는다.
  CHL 은 각국 1부 팀이 모이는 대항전이라 "CHL 소속 팀"이라는 게 없다.
  단 신규 32팀 중 국내 리그가 우리 대상에 없는 팀(스웨덴 SHL·독일 DEL 소속 등)은 임시로 해당 대회 코드를 라벨로 쓴다 —
  SHL·DEL 온보딩 때 갱신 대상.

## 모든 대회에 TeamSourceId 를 명시하는 이유

route 의 팀 해석은 `dbMap(league|tsId)` → `jsonMap.byLeague` → `jsonMap.unambiguous` 순이다.
친선 매핑만 있어도 셋째 unambiguous 로 해석은 된다. 하지만 그 경로는 JSON 두 사본 드리프트에 취약하고
(배구 친선에서 실제로 18건 뒤처져 있었다) 같은 팀이 여러 대회에 나오면 unambiguous 조건이 깨진다.
대회별 키를 DB·JSON 양쪽에 명시해 첫 단계에서 결정론적으로 잡히게 한다.

## 순위표는 여전히 없다

하키 `season/table` 미인가는 그대로다([[hockey-oceania-leagues]]). KHL·Liiga 도 공식 순위표를 못 받는다.
DB 자체 산출은 diary ±30일 창 때문에 시즌 앞부분이 비어 부정확하므로 **쓰지 않는다**.
친선에서 만든 `NO_STANDINGS_LEAGUES` 는 "순위 개념 자체가 없는 대회"용이라 정규리그에는 쓰지 않는다 —
정규리그는 순위 개념이 있고 데이터가 없을 뿐이라, 시즌이 쌓이면 자연히 채워지는 쪽이 맞다.
다만 **개막 직후 몇 경기로 만든 "1위 / 22팀"이 그대로 노출되므로 배포 후 실렌더로 확인**한다.

## 실렌더 검증은 생략하지 않는다

친선 온보딩에서 코드 등록만 하고 끝냈다면 "리그순위 90위 / 147팀"과 "FC 레드불 잘츠부르크"를 놓쳤을 것이다.
순위 산출 경로가 셋(`match-extras` · `SoccerTeamStrength` · `MatchInsight`)이고 팀명 한글화는 호출부마다
리그 인자를 넘겨야 한다. 이번에도 배포 후 두 가지를 스캔한다.
