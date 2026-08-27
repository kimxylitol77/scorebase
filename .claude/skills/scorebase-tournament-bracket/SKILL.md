---
name: scorebase-tournament-bracket
description: 조별리그→녹아웃 대회(배구 선수권·컵 등)의 토너먼트 대진표(8강·4강·결승)를 확인·구축하는 워크플로우. 사용자가 "이거 토너먼트야?", "대진표 만들어줘", "8강인데 브래킷이 없어" 같은 요청을 하거나, 순위 페이지에 조별 표만 있고 녹아웃 단계가 안 보인다는 제보가 오면 사용. 종목별 라운드 데이터 원천 판별 → 유도/백필 → 렌더 연결 → 실렌더 검증까지.
---

# Scorebase 토너먼트 대진표

조별리그가 끝나고 녹아웃에 들어간 대회의 대진표를 세우는 절차. 핵심 판단은
**"라운드 이름의 원천이 있는가"** — 있으면 그 라벨로, 없으면 매치 위상으로 유도한다.

## 종목별 라운드 원천 (2026-08 실측)

| 종목 | 원천 | 경로 |
|---|---|---|
| 축구 컵 | af `league.round` / ts `stage/list?uuid=` | `cup-bracket.ts` — 이미 자동. 안 보이면 `backfill-ts-rounds.ts` |
| 배구 | **없음** — diary 에 stage_id 없음, description 빈값, stage/list 미승인 | `knockout-derive.ts` 위상 유도 — 자동 |
| NBA/NHL 플레이오프 | ESPN 시리즈 | 별도(브라켓 페이지), NBA ESPN 폴백은 허위 대진이라 금지 |

## 배구(위상 유도) — 이미 자동인 것

`/standings/[league]` 의 `VolleyballStandings` 가 렌더마다 유도한다. **새 배구 토너먼트는
아무 작업 없이** 조별 표 + 크로스 그룹 매치만 수집되면 대진표가 자동으로 선다.
- 유도 규칙: 그룹 순위표로 팀→조 매핑 → 첫 크로스 그룹 매치부터 녹아웃 → 각 팀 직전
  라운드 +1 → 라벨은 1라운드 팀 수(8팀=8강). 3·4위전 = 양 팀 모두 직전 패자.
- 다음 라운드는 컬렉터(diary ±30일 sweep)가 일정을 받는 순간 자동 추가.

## 안 보일 때 진단 순서

1. **조별 표가 있나** — `fetchVolleyballTable(league)` 의 그룹 이름이 `Group/Pool/조` 패턴이어야
   팀→조 매핑이 선다. "Ranking of third-placed teams" 같은 보조 표는 제외됨(정상).
   그룹 표 자체가 없으면 standings-poller `VOLLEYBALL_SEASONS` 시즌 등록부터
   (메모리 `volleyball-setup` — season_id 없이 리그코드만 넣으면 자체계산 폴백으로 조용히 틀림).
2. **크로스 그룹 매치가 DB 에 있나** — 없으면 컬렉터 미수집(팀 매핑·UTID_TO_LEAGUE 확인,
   워커는 Vultr `volleyball-collector.js` — 수정 시 scp+restart).
3. **유도 결과** — 크로스 매치 1~2건뿐이면(4팀 미만) 브래킷으로 안 세운다(설계).
4. 감시 축 `vb_bracket_gap` 이 1·2 의 어긋남(크로스 매치 있는데 조 매핑 없음)을 알린다.

## 검증 (필수 — 200 응답은 검증이 아니다)

- dev 또는 프로덕션에서 본문 텍스트를 긁어 "토너먼트 대진표" 섹션과 **실제 대진·스코어**를
  실측 대조한다. 첫 사례: VB_ASIAN_W 8강 = 태국 3:0 한국 · 일본-대만 · 인도네시아-이란 ·
  중국-베트남 (2026-08-27).
- 다음 라운드 일정이 들어온 뒤 라벨이 준결승/결승으로 정확히 늘어나는지 한 번 더 본다.

## 축구 컵일 때

`CUP_LEAGUES` 등록 + `cup-bracket.ts` 경로. 라운드가 비면 `scripts/backfill-ts-rounds.ts`.
게이트 3겹(VALID_LEAGUES/CUP_LEAGUES/렌더 분기)은 메모리 `ts-match-round-in-raw`·
인계 노트의 컵 온보딩 절차 참조.
