# 빅5 슈퍼컵 온보딩 — 체크리스트

목표. 잉글랜드·스페인·이탈리아·독일·프랑스 슈퍼컵 5개를 리그로 올려
`/scores`·리그 페이지·매치 상세에 노출하고, ts 컬렉터가 자동 수집하게 한다.

성공 기준.
- `npm run audit:football-seasons -- --league <5개> --full` 이 CUP 으로 분류되고 예외 없음
- 5개 대회의 과거 매치가 DB 에 있고 스코어 결측 0
- **8/22 DFL 슈퍼컵(도르트문트 vs 바이에른)이 예정 경기로 붙는다**
- tsc 통과 · npm test 통과

## 대상 (실측 확정 2026-08-21)

| 코드 | ts id | ts 이름 | cur_season | 시즌 | 매치 |
|---|---|---|---|---|---|
| COMMUNITY_SHIELD | 9vjxm8gh82r6odg | Football Association Community Shield | 2y8m4zh3073ql07 | 2026 | 1 (8/16 아스날 3-0 맨시티) |
| SUPERCOPA_ESPANA | p3glrw7hzoqdyjv | Supercopa de España | e4wyrn4hgnpq86p | 2026 | 3 (1월 4강) |
| SUPERCOPPA_ITALIANA | e4wyrn4h4kq86pv | EA SPORTS FC Supercup | p4jwq2ghl2dm0ve | 2025-2026 | 3 (12월 4강) |
| DFL_SUPERCUP | z318q66hjyqo9jd | DFL Supercup | k82rekhvzedrepz | 2026 | 1 (**8/22 예정**) |
| TROPHEE_DES_CHAMPIONS | p3glrw7hooqdyjv | French Trophee des Champions | ednm9whk8o5ryox | 2026 | 1 (8/16 랑스 1-0 PSG) |

## 파일 체크리스트 (PORTUGAL_SUPER_CUP 추적으로 도출)

- [x] `types.ts` League 유니온 5개 추가 → 검증: tsc
- [x] `types.ts` SOCCER_LEAGUES 5개 추가 → 검증: tsc
- [x] `sport-leagues.ts` ALL_LEAGUES (화면 노출 단일 기준) → 검증: 리그 페이지 200
- [x] `sport-leagues.ts` SPORTS 축구 묶음(line ~156) → 검증: /scores 축구 탭
- [x] `sport-leagues.ts` LEAGUE_DISPLAY 한글명 → 검증: 실렌더
- [x] `sport-leagues.ts` 정렬값 (10.3 / 12.2 / 13.2 / 14.2 / 15.2 — 각 나라 컵 다음)
- [x] `sport-leagues.ts` LEAGUE_COUNTRY
- [x] `season-calendar.ts` STAGED_COMPETITIONS (컵 분류 — audit 이 CUP 예외를 준다)
- [x] `standings-valid.ts` NO_TABLE_LEAGUES (녹아웃이라 순위표 무의미)
- [x] `thesports/football-competitions.ts` TS_FOOTBALL_COMPETITION_ID
- [x] `thesports/league-id-mapping.json` tsId + tsSeasonId (**Vultr 컬렉터의 정본**)
- [x] `predict/season-window.ts` 단일 대회 목록
- [x] `predict/model-calibration-similar.ts` 컵 제외 목록
- [x] 매치 백필 `backfill:cup-teams --league <code> --season --write`
- [ ] Vultr `league-id-mapping.json` scp + 컬렉터 restart  ← **남음**
- [ ] audit·프로덕션 실렌더 검증 → commit → push  ← 진행 중

## 하지 않는 것

- af 리그 id 등록 안 함. **af id 를 추측하지 않는다**(확인 비용 = af 쿼터).
  ts 로 수집·표시가 다 되고, 컵 라운드 라벨이 필요 없는 단발 대회다.
- 리더보드 등록 안 함 — 1~3경기짜리라 득점왕 표가 무의미(PORTUGAL_SUPER_CUP 과 동일 판단).
- 순위표 등록 안 함 — 녹아웃.


## 실행 결과 (2026-08-21)

백필 — 신규 팀 0 · 충돌 0 · skippedNoTeam 0. 전부 기존 빅5 클럽 재사용.

| 대회 | 매치 |
|---|---|
| COMMUNITY_SHIELD | 8/16 아스날 3-0 맨시티 |
| SUPERCOPA_ESPANA | 1/7 바르사 5-0 아틀레틱 · 1/8 AT마드리드 1-2 레알 · 1/11 결승 바르사 3-2 레알 |
| DFL_SUPERCUP | **8/23 03:30 KST 도르트문트 vs 바이에른 (예정)** |
| SUPERCOPPA_ITALIANA | 12/18 나폴리 2-0 밀란 · 12/19 볼로냐 1-1 인테르 · 12/22 결승 나폴리 2-0 볼로냐 |
| TROPHEE_DES_CHAMPIONS | 8/16 랑스 1-0 PSG |

## 계획에 없던 곁가지 1건

`season-watch.ts` 의 `no-standings-source` 가 녹아웃 컵에 HIGH 를 매기고 있었다.
슈퍼컵 4개를 올리자마자 HIGH 4건이 새로 생겨서, **범주 오류**로 판단하고 고쳤다 —
`NO_TABLE_LEAGUES` 는 순위표가 발행될 일이 아예 없으므로 "순위 소스 없음"이 영구 정상이다.
LOW 로 낮추고 사유를 detail 에 명시했다. 기존 FA컵·EFL컵·천황배·르베인·코파 이탈리아 등
8개가 비수기마다 울리던 것도 같이 잠잠해진다.

전체 audit: **HIGH 0 · MED 0 · LOW 19.**
