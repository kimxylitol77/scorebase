# 야구 선수 랭킹 — 컨텍스트 노트

- 타자 종합 = OPS 40·HR 20·RBI 15·AVG 15·안타 10 백분위, 자격 = 리그 최다 출장의 50% 이상. 투수 종합 = ERA 35·WHIP 25·탈삼진 20·이닝 10·승+세이브 10(ERA·WHIP 은 낮을수록 높은 백분위), 자격 = 30이닝 이상.
- 가성비 = 종합 − 연봉 백분위(리그 내 log 연봉). 이름 매칭은 KBO 한글명 exact, MLB 영문명 exact.
- 폼 = 타자 최근 10경기 OPS(25타수 이상), 투수 최근 5등판 ERA(10이닝 이상). KBO 로그엔 HBP 가 없어 OBP 분모는 AB+BB 로 근사.
- 선수 링크: KBO /players/{kboId}?league=KBO, MLB /players/{mlbamId}, NPB 는 투수만 /players/{npbId}?league=NPB(타자 상세 없음). 사진은 MLB headshot 만.
