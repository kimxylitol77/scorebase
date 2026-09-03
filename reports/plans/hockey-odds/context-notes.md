# 하키 배당 온보딩 — 컨텍스트 노트 (2026-09-03)

## 왜

/odds 는 축구·야구·농구뿐이고 하키는 NHL 만 The Odds API 로 배당을 받는다.
최근 30일 실측 — KHL 0/17 · LIIGA 0/17 · CHL 0/24 · 덴마크 0/9 (전부 배당 없음).

## 실측 (2026-09-03)

- The Odds API `/sports?all=true` — `icehockey_liiga` active, 9/4 개막 6경기 게시.
  `icehockey_sweden_hockey_league`(SHL) 도 active 지만 우리 리그 목록에 SHL 이 없다 → 리그 온보딩이 먼저.
- TheSports `/v1/ice_hockey/odds/history?uuid=` — **우리 플랜에서 인가됨** (축구·농구·테니스·핸드볼은
  "URL is not authorized"). 응답은 야구·배구와 같은 `{companyId: {eu|asia|bs: [[ts,v1,mid,v2,status]]}}`,
  company "2" = bet365. eu 의 mid 는 0 (2-way 머니라인, 연장 포함).
- DB 하키 매치(±14일)는 전부 ts 매핑 있음(theSportsCache.tsMatchId 또는 externalId ts-) →
  배구 폴러의 매핑 라우트를 그대로 쓸 수 있다.
- LIIGA 팀명(DB) — "KalPa Hockey"·"Ilves Tampere"·"Assat"·"Vaasan Sport"·"Jukurit"·"K-Espoo".
  Odds API 는 "KalPa"·"Ilves"·"Ässät"·"Sport"·"Jukurit" — normalizeOddsTeamName 의 양방향 부분일치로
  붙는다. **K-Espoo ↔ Kiekko-Espoo 는 부분일치가 안 될 수 있음** — 첫 수집 후 tally 로 확인.

## 결정

1. **저장 테이블은 TsBaseballOddsHistory 재사용** (야구·배구가 이미 그렇게 쓴다 — sport-agnostic).
2. **marketHome 반영은 저장 라우트(save-baseball-odds)에서 하키만.** 배구는 volleyball-predict 가
   따로 쓰지만 하키는 별도 예측 cron 이 없고 predict-upcoming(전 리그) 이 marketHome 을 읽으므로
   저장 시점에 바로 반영하는 게 단계가 가장 적다. NHL 은 The Odds API 가 주인이라 제외
   (이중 소스 덮어쓰기 금지 — af-odds 의 원칙과 동일).
   야구는 "백테스트 없이 market blend 자동 켜짐" 을 이유로 marketHome 을 일부러 안 쓴다
   (api-baseball-odds.ts 헤더). 하키는 NHL 이 이미 시장 블렌드를 쓰고 있어 같은 정책을 유럽 리그로
   넓히는 것이지 새 정책이 아니다.
3. **폴러는 배구 폴러 복제**(hockey-odds-poller.js), 3분 주기·±2일. 매핑 라우트는 새로 만들지 않고
   `?sport=hockey` 파라미터로 리그 집합만 바꾼다(기본값 volleyball 유지 — 기존 폴러 무변경).
4. /odds 하키 탭은 2-way(hasDraw=false), 시계열은 야구와 같이 ts 히스토리 15분 버킷을 쓴다.
5. predict-upcoming 은 이미 낸 픽을 고정한다(force 없이는 재계산 안 함) — 하키 픽이 marketHome
   도착 전에 이미 나 있으면 그 경기는 Elo 단독으로 남는다. 폴러가 ±2일을 돌므로 대부분은 픽 전에
   배당이 먼저 온다. 여기서는 손대지 않는다.

## 함정

- Vultr 배포는 `root@64.176.230.240`, 파일은 반드시 `/home/ubuntu/scorebase-worker/src/` 하위,
  유닛은 `/etc/systemd/system/`, chown ubuntu 후 daemon-reload (메모리 vultr-worker-deploy-path).
- 저장 라우트의 raw odds(oddsHome 등)는 gap-fill(null 일 때만) — 하키 marketHome 은 갱신형으로 둔다.
