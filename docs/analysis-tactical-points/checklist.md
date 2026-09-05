# 체크리스트

- [x] `src/lib/tactical/weekly-points.ts` — 대상 경기 선정 + 양 팀 최근 5경기 프로필 + 게이트 + 프롬프트 데이터 블록 → 검증: EPL·LALIGA 실데이터로 블록 출력
- [x] `src/prompts/season-analysis.ts` — 블록 있을 때 H2 "이번 주 주목할 전술 포인트 3가지" 필수 구조 + 창작 금지 규칙 → 검증: 프롬프트 문자열 육안 확인
- [x] `src/jobs/generate-analysis.ts` — 축구 리그에서 블록 조립해 프롬프트에 주입 → 검증: tsc
- [x] LLM 1회 dry 생성으로 섹션 형식·수치 오염 확인 (DB 쓰기 없음)
- [x] tsc·eslint 통과 + 커밋
