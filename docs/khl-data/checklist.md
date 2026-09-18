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
## D. 마무리
- [ ] tsc·테스트·실렌더(dev+prod) → 커밋·push → 메모리 갱신(season/table 인가 정정)

## 실측 (2026-09-18 dev)
- 순위 캐시 유입: poller 재시작 후 첫 회차 ok 163→164, 표 7개(전체 22·컨퍼런스 11·11·디비전 5·5·6·6)
- 선수 사전: 630명, 한글명 625, 사진 573, 생년월일 628, 키 462, 국적 567(러시아 426·캐나다 51·카자흐 28·벨라루스 27·미국 24)
- 리더보드: 종료 53경기·545명 집계 — 골 베일리 5, 도움 골도빈 11, 포인트 골도빈 12, SV% 오졸린 .969(94/97)
- 페이지: /standings/KHL·/hockey·/leagues/KHL?view=standings·/standings·/teams/612861 모두 200, 한글 팀명 22 적용
