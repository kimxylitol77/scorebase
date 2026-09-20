# 야구 해외파 — 컨텍스트 노트

- 국적 판정은 birthCountry === "Republic of Korea" (API 표기, "South Korea" 아님). 출생지 기준이라 한국 출생 외국 국적(Refsnyder)이 섞인다 → 스크립트 EXCLUDE 목록으로 뺀다. 반대로 외국 출생 한국 국적은 못 잡는다(현재 해당자 없음).
- 명단(누가)은 주간 정적 빌드, 성적(얼마나)은 런타임 캐시 — 축구 해외파가 명단 정적 + 현재 성적 스크립트인 것과 달리 MLB API 가 무료·무키라 런타임으로 충분.
- 레벨 우선순위 1(MLB) > 11(AAA) > 12(AA) > 13(A+) > 14(A) > 16(Rookie). 여러 레벨에 등록된 선수는 최상위 레벨을 현재 소속으로.
- 한글명은 data/mlb-players.json(김하성·이정후) 우선, 나머지는 스크립트 안 NAME_KO 수동 표.
- 다음/최근 경기는 우리 Match(league=MLB) 를 Team.name 으로 매칭 — MLB API teamName 과 Team.name 이 동일 표기.
