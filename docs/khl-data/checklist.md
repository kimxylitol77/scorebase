# KHL 데이터 전면 온보딩 체크리스트 (2026-09-18)

목표. 개막한 KHL(러시아 하키)의 **순위표·선수(스쿼드·프로필)·선수 기록 리더보드**를 TheSports 에서 받아 사이트에 노출.
근거. 2026-09-18 실측 — `ice_hockey/season/table/detail`(8월엔 미인가)이 열려 KHL 26/27 표 7개(전체·컨퍼런스 2·디비전 4)가 온다.
`team/squad/list`·`player/list?uuid=` 도 열림. 시즌 선수 통계 API 는 여전히 미인가 → 경기 캐시(detailLive.players, 40/40 보유)로 집계.

## A. 순위표
- [x] standings-poller.js — HOCKEY_SEASONS(KHL, season ednm95bvekxryox) + fetch 루프
- [x] Vultr 배포 (scp → chown → node --check → restart) + 캐시 유입 확인
- [x] hockey-table.ts — 캐시 → 표 그룹(전체/컨퍼런스/디비전) + tsId→ourId 매핑
- [x] /standings/KHL — 전용 렌더(승·연장승·패·연장패·승점) + STANDINGS_VALID 등록
- [x] /standings 허브 카드 + 하키 허브 KHL 블록(top3·링크) + /leagues/KHL 순위 탭
## B. 선수
- [x] build-khl-players.ts — 22팀 squad → player/list 프로필 → data/khl-players.json (+Haiku 한글명)
- [x] khl-players.ts 로더 + 팀 페이지 KHL 로스터(F/D/G, 사진·등번호·키·몸무게·나이)
- [x] 라이브 골 타임라인·박스스코어 이름 — nhl-live-names 가 KHL 사전 폴백
- [x] weekly-static-refresh 등록
## C. 선수 기록
- [x] KHL 리더보드 집계(캐시 players → LeagueLeader GOAL/ASSIST/POINT/SAVE) + 일일 잡 편입
- [x] /standings/KHL 리더보드 섹션
## B-2. 부상자 (2026-09-18 추가 — 사용자 결정 "1번")
- [x] build-khl-players.ts — team/injury/list 22팀 조회 → json `injuries[]` (원본 필드 보존)
- [x] khl-players.ts — khlInjuries/khlInjuryOf/khlInjuryLabel, 팀 페이지 로스터 "부상" 배지 + 소제목 카운트 (가짜 1건 주입 실렌더 확인)
- 실측: 22팀 전부 0건. 다른 부상 API(injury/list·match/injury/list·player/injury/list)는 미인가. KHL 공식 사이트는 구조화 명단 없음 + 자동 추출 금지 약관.

## D. 마무리
- [ ] tsc·테스트·실렌더(dev+prod) → 커밋·push → 메모리 갱신(season/table 인가 정정)

## 실측 (2026-09-18 dev)
- 순위 캐시 유입: poller 재시작 후 첫 회차 ok 163→164, 표 7개(전체 22·컨퍼런스 11·11·디비전 5·5·6·6)
- 선수 사전: 630명, 한글명 625, 사진 573, 생년월일 628, 키 462, 국적 567(러시아 426·캐나다 51·카자흐 28·벨라루스 27·미국 24)
- 리더보드: 종료 53경기·545명 집계 — 골 베일리 5, 도움 골도빈 11, 포인트 골도빈 12, SV% 오졸린 .969(94/97)
- 페이지: /standings/KHL·/hockey·/leagues/KHL?view=standings·/standings·/teams/612861 모두 200, 한글 팀명 22 적용

## E. /scores 하키 순위 칩 + AI 예측 (2026-09-18 오후, 사용자 요청)
- [x] 유럽 6개 리그 공식 표 실측(CHL·리가·스위스NL·체코·슬로바키아·덴마크 전부 code=0, 매핑 100%·체코 10/14) → poller HOCKEY_SEASONS 7개, HOCKEY_TS_TABLE_LEAGUES 7개, Vultr 배포(ok 164→170)
- [x] 체코 미매핑 4팀(스파르타 프라하·마운트필드·파르두비체·올로모우츠) — 기존 Team row 재사용, 매핑 JSON 두 사본 + TeamSourceId + 라벨 갱신, 워커 사본 scp·재시작
- [x] /scores 카드 [순위] 칩 — 하키 공식 표 리그는 fetchHockeyTable 전체 순위 (rankChipPromise 분기)
- [x] /standings 허브 카드 6장·하키 허브 블록 6개(공식 Top3)·/leagues/{code} 순위 탭·STANDINGS_VALID
- [x] 예측 — pick-readiness 골리 게이트를 NHL 로 한정. predict-upcoming --apply 로 KHL 3건 생성
- [ ] 자연 해소 대기 — MIN_PRIOR(팀당 종료 5경기) 미달이 대부분(유럽 리그 개막 1~2주차). 팀이 5경기를 채우면 03·13시 UTC 크론이 자동 생성. 임계는 낮추지 않는다(cup-prediction-prior-gap 메모리)
