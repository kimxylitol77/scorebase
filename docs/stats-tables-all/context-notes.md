# 컨텍스트 노트
- 09-23 사용자 "더 없어? 하키 등등도 다 해줘". databallr 요소 2차(카드·리더·산점도·용어·열 묶음) 직후 착수.
- 다섯 페이지 공용화: 파라미터는 pills(param·options·value·resets) 로 페이지가 넘기고, view·sort·dir·page·qual·cmp·team·q·x·y 는 탐색기가 처리. url() 이 pills 의 param 만 쿼리에 남긴다.
- NHL API 는 `limit=-1` 로 전량, cayenneExp 에 seasonId·gameTypeId=2. shootingPct·faceoffWinPct 는 0~1 비율이라 ×100. timeOnIcePerGame 은 초.
- KBL 시즌 평균 API 필드명이 축약(score·rb·aS·sT·bS·threep·fdgRt·playSec). listCn 128 이상은 500 — 래퍼가 120씩 페이지.
- dev 로컬 500 은 대부분 Neon 풀 타임아웃(P2024) — 재요청으로 확인 후 진행.

## 2026-09-23 추가 — KHL 표 (ts 경기 캐시 집계)

- 질문 "ts 는 자료 없어?" 실측. TheSports 는 하키·농구·배구의 시즌 선수 통계(`season/player_stats`)와 배구·e스포츠 `player/list` 가 미인가("URL is not authorized"). 인가된 것은 경기 단위 `detail_live.players` 와 하키·농구 `player/list`·`team/squad/list` 뿐.
- 그래서 KHL 은 리더보드 `runKhl` 과 같은 방식으로 종료 경기 캐시를 선수별 누적해 시즌 표를 만든다(`getTsHockeyStatsData`, 6시간 캐시). 코드 20 유형·23 TOI·24 세이브·25 선방률·26 골·27 도움·28 유효슛·56 +/-. 피슈팅·실점은 세이브÷선방률 역산.
- 열은 부분집합(`columnsForRole(role, "ts")`) — PIM·히트·블록·승패·PP 는 소스에 없다. 행 키는 ts 선수 id(`tsId`), 선수 페이지가 없어 링크 없음, 사진은 khl-players.json.
- 이름 커버리지 실측 572명 중 사전 매칭 527(한글 526). 미등록 45명은 리더보드와 같이 원본 id 로 노출.
- 리가·스위스·체코 엑스트라리가도 캐시(42·26·21경기)는 있지만 이름 사전이 없어 보류 — 하려면 `team/squad/list`+`player/list` 로 사전을 만들어야 한다.
- dev 워크트리 함정. `.claude/launch.json`(gitignore) 의 scorebase-dev 에 절대 `cwd` 가 있어 preview_start 가 거부됨 → cwd 제거.
