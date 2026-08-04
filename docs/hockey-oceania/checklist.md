# 오세아니아 아이스하키 리그 온보딩 (AIHL · NZIHL)

사용자 요청 2026-08-04. 하키 클럽친선 문의에서 출발해, 프리시즌 친선보다 **정규시즌이 진행 중인**
호주·뉴질랜드 리그를 먼저 붙이기로 확정.

## 실측 (2026-08-04)

| 리그 | TheSports utid | 시즌 id | 팀 |
|---|---|---|---|
| Australian Ice Hockey League | `56ypq3vbx7erd7o` | `l5erg6be3w5q8k0` | 10 |
| New Zealand Ice Hockey League | `gpxwrx0bdx3ryk0` | `y39mp9byj3xrojx` | 스캔 중 |

⚠️ **AIHL utid 는 IIHF_WC(`56ypq3vbxgerd7o`)와 한 글자만 다르다** (`x7e` vs `xge`).
   복사 실수 시 조용히 IIHF 경기를 AIHL 로 넣는다 — 등록 후 반드시 대조할 것.

⚠️ **하키는 season/table 구독 권한이 없다** — `URL is not authorized to access`.
   순위표는 DB 매치 자체계산(`calcStandings`) 경로만 가능하고, 그러려면 과거 결과가 DB 에 있어야 한다.
   collector 는 ±5일만 sweep 하므로 **시즌 과거분은 1회성 백필**이 필요.

## 체크리스트

### 1) 데이터 확보
- [x] 시즌 전체 diary 스캔 (3/25~) — 팀 전체 명단 + 과거 매치
- [x] 팀 시드: `Team` + `TeamSourceId(source='thesports')`
- [x] 매핑 json **2개 사본** 갱신 (`src/lib/sports/thesports/` · `lightsail-worker/`)
- [x] 과거 매치 백필 (시즌 개막~현재)

### 2) 리그 등록 (필수 — 하나만 빠져도 화면에 안 뜸)
- [x] `types.ts` League union
- [x] `sport-leagues.ts` — `ALL_LEAGUES` · `SPORTS.hockey.leagues` · `LEAGUE_DISPLAY` · `LEAGUE_ORDER` · `COUNTRY_BY_LEAGUE`
- [x] `COUNTRY_FLAG`·`COUNTRY_ORDER` 에 뉴질랜드 (현재 없음)
- [x] `sports/index.ts` no-op collector stub (매치 소스는 워커)

### 3) 조용히 반쪽 동작하는 곳
- [x] `predictionEngine.ts` 의 하드코드 `HOCKEY_LEAGUES` Set (안 고치면 축구로 오분류)
- [x] `live/[league]/[gameId]` 하드코드 3곳 → `HOCKEY_LEAGUES.has()`
- [x] `/hockey` 허브 `HOCKEY` 배열 + `LEAGUE_BLOCKS`
- [x] `season-window.ts` 시즌 시작월
- [x] `analysis/matches.ts` `LEAGUE_KO`, 팀 한글명

### 4) 워커
- [x] `lightsail-worker/ice-hockey-match-collector.js` `COMP_TO_LEAGUE` 2줄
- [ ] Vultr rsync + `systemctl restart` (경로는 메모리 vultr-worker-deploy-path)

### 5) 검증
- [x] AIHL 매치가 IIHF_WC 로 새지 않았는지 대조
- [x] tsc + 로컬 `/scores` 하키 탭 실렌더
- [ ] 커밋·push·배포 확인

## 실행 결과 (2026-08-04)

- 팀 **15** 생성 (AIHL 10 · NZIHL 5), 전부 로고 확보. 매핑 json 48 → 63 (양쪽 사본)
- 매치 **54** 백필 (AIHL 39 · NZIHL 15) — 종료 40건 점수 포함
- IIHF_WC 오염 **없음** (utid 한 글자 차이 대조 통과)

### 스캔에서 걸린 것 세 가지

1. **diary 는 최근 ~30일만 열린다** — 그 이전은 `code=405`. 처음 3/25부터 긁으려다 102일이
   전부 실패했다. 시즌 전체(4월 개막)는 확보 불가 = **순위를 신뢰할 수 없다**.
2. **점수는 `m.scores` 객체**(`{ft, p1..p3, ot, ap}`, 각 `[home, away]`)다. `home_scores`/
   `away_scores` 를 읽으면 종료 경기 40건이 전부 null 로 나온다. 워커
   `ice-hockey-match-collector.js:53` 과 같은 규칙을 써야 한다.
3. **`status_id=0`(ABNORMAL/Suggest Hiding) 을 걸러야 한다.** TheSports 가 같은 경기를 두 id 로
   주고 한쪽을 숨김 권장한다. 안 거르면 같은 카드가 두 번 뜨고, 이미 지난 날짜가 SCHEDULED 로
   남는 유령 row 가 생긴다(실제로 3건 발생 → 삭제). 워커는 `:118-121` 에서 0·99 를 스킵한다.

### 남은 것

- [ ] 워커 배포 (Vultr rsync + `systemctl restart scorebase-ice-hockey-match-collector`)
- [ ] 순위표 — TheSports 하키는 `season/table` **구독 권한 없음**(`URL is not authorized`).
      DB 자체계산도 시즌 앞부분이 비어 부정확해 `/hockey` 허브 top3 는 의도적으로 비워 뒀다
      ("순위 데이터 준비 중"). 필요하면 구독 문의 또는 다음 시즌 개막부터 전량 수집.
- [ ] `/leagues/AIHL` 리그 페이지 (VALID_LEAGUES·LEAGUE_META) — 현재 미등록이라 /scores 로만 진입
