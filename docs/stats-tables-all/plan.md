# 스탯 마스터 표 전 종목 확장 — 계획 (2026-09-23)

**무엇.** 야구·축구 표에 이어 하키(NHL)·농구(KBL)·e스포츠(LoL LCK·LEC·LCS) 표를 붙이고, 다섯 페이지가 같은 화면을 쓰도록 공용 탐색기(`src/components/stats/StatsExplorer.tsx`)로 묶는다.
**왜.** 사용자 요청("하키 등등도 다"). 페이지 복제가 5배가 되기 전에 화면을 한 곳에 모아야 뷰(카드·리더·산점도) 개선이 전 종목에 한 번에 반영된다.

## 재료
- NHL: 공식 stats API(api.nhle.com/stats/rest) 스케이터 요약 940·리얼타임(히트·블록)·골리 98. 2026-27 은 10월 개막 전이라 0건 → 2025-26 최종으로 내려감(로더가 자동, 화면에 "최종" 표기). 이름은 nhl-live-names 사전(없으면 영문), 링크 /players/{id}?league=NHL.
- KBL: 공식 통계 API 전체 선수 시즌 평균(ruleCk=0, 120씩 페이지). 값이 경기당 평균이라 합계 = 평균×경기. 비시즌엔 직전 시즌(2025-26). 사진 kbl.or.kr, 링크 /players/{no}?league=KBL.
- LoL: 경기 기록(lolGames) 세트 집계(aggregateLolPlayers, 올해 1/1 이후). 팀명 aggregateLolTeams, 사진·포지션 data/lol-players.json. LPL 은 세트 기록 없음 → 제외.
- 없는 것: KHL(시즌 선수 통계 API 미인가, 경기 캐시 집계는 리더보드 상위만), WKBL(HTML 부문별 순위만), NBA(선수 로그 저장 없음), V-리그(선수별 개별 호출 필요, 비시즌).

## 규칙 (전 종목 동일)
- 규정 = 역할별 출전(경기·선발·분·세트) 최다의 40%. 미달은 표에 남기되 백분위 없음.
- 백분위 = 같은 리그·역할 규정 선수 중 나보다 못한 값의 비율, 동률 절반, "낮을수록 상위" 열 반전.
- 화면 = StatsExplorer(표/카드/리더/산점도, 열 묶음, 용어, 정렬, 팀 칩, 검색, 비교 2명, 페이지). 페이지는 데이터·열·필·decorate 만.

## 산출물
- `src/lib/sports/{hockey,basketball,esports}/stats-table.ts` + `stats-data.ts`, 페이지 `/hockey/stats` `/basketball/stats` `/esports/stats`
- 야구·축구 페이지를 StatsExplorer 로 재작성(동작 동일)
- 허브 진입 링크(하키·농구), 표끼리 상호 링크
