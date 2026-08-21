# 카코넨 온보딩 — 컨텍스트 노트

## 핵심 — ts 에 카코넨 대회 id 가 없다

살아있는 데이터는 "Finnish Ykkonen"(`gpxwrxlh7zryk0j`) 시즌 안의 stage 뿐이다.
별도 `Finnish Kakkonen West/South/North/East` 4개는 **cur_season 이 비어 있다**(휴면).

우리 파이프라인은 "대회 1개 = 리그 1개" 전제라 **stage 인식**을 넣어야 했다.

## 어디를 건드렸고 어디는 안 건드렸나

| 계층 | 처리 |
|---|---|
| 매치 컬렉터(워커) | `STAGE_SPLIT` 신설 — stage **이름**으로 리그 분기 |
| 순위 폴러 | league-id-mapping 3개 추가로 자동(같은 시즌을 3번 조회, 각자 자기 팀만 렌더) |
| 팀 매핑 | `backfill:cup-teams --stage "Group A"` 신설 |
| 감사 분모 | `TS_SHARED_SEASON_LEAGUES` += 3 |

**`TS_FOOTBALL_COMPETITION_ID` 는 건드리지 않았다.** code↔competition 1:1 인덱스이고
역방향 `TS_FOOTBALL_LEAGUE_BY_COMPETITION` 을 `football-collector.ts` 가 쓴다. 3개를 넣으면
`gpxwrxlh7zryk0j → YKKONEN` 이 KAKKONEN_C 로 덮인다.

**Group D 는 STAGE_SPLIT 에 안 넣었다.** YKKONEN 매치는 af 정본(132건·ts- 0건)이라
ts 로도 만들면 크로스소스 중복이 된다. 실측 검증에서 Group D 6건이 정상적으로 건너뛰어졌다.

`compToCode` 는 **선착순**으로 바꿨다 — 4개 코드가 한 tsId 를 공유하므로 나중 항목이
YKKONEN 을 덮으면 안 된다. 그 대회의 실제 분기는 STAGE_SPLIT 이 맡는다.

## 발견한 별건 — 이름 재사용이 종목을 안 봤다

`backfill-cup-team-mapping.ts` 의 2단 판정("정규화 이름이 **유일**하게 일치하면 재사용")이
Team 테이블 전체를 봤다. Team 에는 하키·배구·농구 팀도 있다.

**실측: 카코넨 A조의 축구 HIFK 가 아이스하키 `LIIGA:HIFK` 로 잡혔다.** 우리 DB 에 축구 HIFK 가
아예 없어서 "유일 일치" 가드도 그대로 통과했다. 배구 케이스(CONCACAF_GOLD 과테말라 등)는
후보가 2개라 보류됐지만, 후보가 1개면 조용히 오매핑된다.

→ 후보를 `SOCCER_LEAGUES` 로 제한했다. 이 스크립트는 football 전용이다.

**전수 감사로 기존 오염 3건을 찾았다.**

| 매핑 | 잘못 가리킨 곳 | 조치 |
|---|---|---|
| COUPE_DE_FRANCE Bordeaux | `CHL_HOCKEY` (아이스하키) | 교정 — 축구 row 신설·매치 3건 이전 (내가 만든 것) |
| CONCACAF_GOLD Cuba | `VNL` (배구) | 교정 — 축구 row 신설·매치 2건 이전 (내가 만든 것) |
| ISRAEL_PL Hapoel Jerusalem | `NBA` (농구) | **미처리** — 기존 건이고 af id 충돌이 얽혀 별건 |

ISRAEL_PL 은 `ourExternalId=131570`(af id)인 NBA row 를 축구 리그가 가리킨다. ts 이름 매칭이
아니라 af id 충돌이라 원인이 다르고, 매치 1건도 그 row 를 쓴다. 손대려면 af 쪽부터 봐야 한다.

## 재사용 가능한 감사 쿼리

```
축구 리그 네임스페이스의 TeamSourceId / team-id-mapping.json 항목이
비축구 Team(league ∉ SOCCER_LEAGUES)을 가리키는지
```
DB 3905건·JSON 2767건 중 각 2건이 걸렸다. **새 리그를 올릴 때마다 돌릴 값어치가 있다.**
