# 카코넨(핀란드 4부) 온보딩 — 체크리스트

목표. KAKKONEN_A/B/C 3개 조의 순위표와 경기를 노출하고, 이후 자동 수집되게 한다.

## 왜 특별한가

ts 에 카코넨 전용 대회 id 가 **없다**. 살아있는 데이터는 "Finnish Ykkonen"
(`gpxwrxlh7zryk0j`) 시즌 안의 stage 로만 존재한다.

```
Group A/B/C (각 10팀·18R) = Kakkonen 4부   ← 우리가 올릴 것
Group D     (12팀·22R)    = Ykkönen 3부    ← 기존 YKKONEN (af 수집)
별도 Finnish Kakkonen West/South/North/East = 현재 시즌 없음(휴면)
```

우리 파이프라인은 "대회 1개 = 리그 1개"를 전제하므로 **stage 인식**이 필요하다.

## 성공 기준

- `/leagues/KAKKONEN_A|B|C` 각각 자기 조 10팀 순위표 + 경기
- 새 경기가 컬렉터로 자동 유입 (stage 라우팅)
- YKKONEN 회귀 없음 (Group D 는 af 정본 유지, ts 중복 생성 금지)

## 체크리스트

- [ ] `league-id-mapping.json` += 3 (tsId·tsSeasonId 는 YKKONEN 과 동일) — 순위 폴러용
- [ ] `sports-event-location.ts` += 3 (핀란드)
- [ ] `i18n/en.ts` += 3
- [ ] `TS_SHARED_SEASON_LEAGUES` += 3 — 감사 분모를 stage 범위로
- [ ] `backfill-cup-team-mapping.ts` `--stage` 모드 신설
- [ ] 팀 매핑 + 매치 백필 3회 (A/B/C)
- [ ] 워커 `football-match-collector.js` STAGE_SPLIT + compToCode 선착순
- [ ] 워커 배포(js + json) + restart
- [ ] 실렌더 검증 → commit → push

## 하지 말 것

- **`TS_FOOTBALL_COMPETITION_ID` 에 넣지 말 것.** 이건 code↔competition 1:1 인덱스이고
  역방향 `TS_FOOTBALL_LEAGUE_BY_COMPETITION` 을 `football-collector.ts` 가 쓴다.
  3개를 넣으면 `gpxwrxlh7zryk0j → YKKONEN` 이 KAKKONEN_C 로 덮인다.
- **Group D 를 STAGE_SPLIT 에 넣지 말 것.** YKKONEN 매치는 af 정본(132건, ts- 0건)이라
  ts 로도 만들면 크로스소스 중복이 된다.
- stage_id 를 코드에 박지 말 것 — 시즌마다 바뀐다. stage **이름**으로 라우팅한다.

## 이미 돼 있는 것 (확인함)

types.ts(union·SOCCER_LEAGUES) · sport-leagues(ALL_LEAGUES·SPORTS.soccer·DISPLAY
"핀란드 카코넨 A/B/C"·정렬 15.9361~3·국가) · api-football-pro(247/248/249) ·
index.ts collectors · season-window. **리그 껍데기는 있고 데이터만 비어 있었다.**
