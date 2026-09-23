# 축구 선수 스탯 마스터 표 — 계획 (2026-09-23)

**무엇.** `/soccer/stats` 새 페이지. 야구 표(/baseball/stats)와 같은 문법(셀마다 리그 백분위, 정렬·검색·팀 칩·비교 2명·90분당 전환)을 축구 시즌 기록에 적용.
**데이터.** PlayerSeasonStatArchive(source=ts, 리그별 현재 시즌 = seasonLabel 최댓값). 2026-27 EPL 405·라리가 446·세리에A 442·리그1 376·분데스 358·에레디비시 330·챔피언십 297·포르투갈 279·튀르키예 274·사우디 413, 2026 MLS 855·브라질 700·K1 374·K2 505·J1 404. 리그당 45명 미만(분데스2·리그2)은 제외.
stat 키: pos(G/D/M/F)·matches·starts·minutes·goals·assists·shots·sot·keyPasses·passAcc·tackles·interceptions·yellow·red·saves·cleanSheets·conceded.
**평점.** PlayerMatchLog(시즌 시작 7/1 이후, 분 가중 평균, 전 대회 합산 — af 리그만 있음). 없는 리그(K리그 등)는 열 값 "—".
**이름.** TheSportsPlayer(FOOTBALL 4.3만, nameKo 우선). 링크 `/transfers/{tsId}`. 사진은 사이트가 쓰는 소스 그대로(없으면 이니셜).

## 규칙
- 규정 = 리그 최다 출전 분(minutes)의 40% 이상. GK 는 같은 기준. 미달은 표에 남기되 백분위 없음.
- 열: 필드 = 출전·선발·분·골·도움·슈팅·유효슛·키패스·패스%·태클·인터셉트·경고·퇴장·평점 / GK = 출전·선발·분·세이브·클린시트·실점·패스%·평점. 포지션 필 G/D/M/F(기본 전체, GK 는 G 선택 시 GK 열).
- 90분당 = 골·도움·슈팅·유효슛·키패스·태클·인터셉트·세이브·실점 ÷ (분/90). 비율(패스%)·평점은 그대로.
- 백분위 반전 열 = 실점·경고·퇴장.
- 야구 표의 percentile·sortStatRows·formatStat·StatColumn 타입을 그대로 import(계산 공용화). 화면은 야구 페이지와 같은 구조를 따로 작성(표 컴포넌트 공용화는 두 표가 안정된 뒤).

## 산출물
- `src/lib/sports/soccer/stats-table.ts` 열 정의·행 빌드(규정·90분당·백분위) + 테스트
- `src/lib/sports/soccer/stats-data.ts` 로더(아카이브+이름+평점, unstable_cache 6h)
- `src/app/soccer/stats/page.tsx`, 축구 허브·이적시장 랭킹에 진입 링크
