# 컨텍스트 노트
- 09-23 사용자 "더 없어? 하키 등등도 다 해줘". databallr 요소 2차(카드·리더·산점도·용어·열 묶음) 직후 착수.
- 다섯 페이지 공용화: 파라미터는 pills(param·options·value·resets) 로 페이지가 넘기고, view·sort·dir·page·qual·cmp·team·q·x·y 는 탐색기가 처리. url() 이 pills 의 param 만 쿼리에 남긴다.
- NHL API 는 `limit=-1` 로 전량, cayenneExp 에 seasonId·gameTypeId=2. shootingPct·faceoffWinPct 는 0~1 비율이라 ×100. timeOnIcePerGame 은 초.
- KBL 시즌 평균 API 필드명이 축약(score·rb·aS·sT·bS·threep·fdgRt·playSec). listCn 128 이상은 500 — 래퍼가 120씩 페이지.
- dev 로컬 500 은 대부분 Neon 풀 타임아웃(P2024) — 재요청으로 확인 후 진행.
