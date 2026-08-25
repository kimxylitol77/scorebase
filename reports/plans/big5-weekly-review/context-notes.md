# 컨텍스트 노트

- **weekly-xi 와의 관계**: 주간 베스트 XI·MVP 글(`generate-weekly-best-xi`)은 이미 화 10:00 KST 발행 중.
  주간 리뷰는 관점이 다르다 — XI 글은 선수 중심, 리뷰는 리그 전체(결과·감독·이변).
  MVP 선수는 `getWeeklyBestXi()` 의 mvp 를 재사용해 두 글의 수치가 어긋나지 않게 한다.
- **MVP 감독 산식**: 팀 주간 승점 - 시장 기대 승점(marketHome/Draw/Away 로 3·1·0 가중).
  절대 승점 동률이면 초과성과 큰 쪽. 시장 확률 없는 경기는 기대 승점에서 제외.
- **감독명**: `data/team-coaches.json` (ts team id 키, nameKo 포함 323팀).
  Team → ts id 는 TeamSourceId(source=thesports).
- **cron 슬롯**: 현재 90/약 100 — 1개 추가 여유 확인함(101 때 빌드 실패 이력).
  weekly-xi(01:00 UTC) 뒤 02:00 UTC 로 — XI 글이 먼저 나와야 리뷰가 참조 가능.
- **팩트 게이트**: LLM 판정 대신 결정론 수치 대조(야구 주간 글 원칙). 본문 스코어·승점이
  데이터에 실존하는지 확인.
