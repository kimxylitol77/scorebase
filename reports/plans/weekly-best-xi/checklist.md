# 주간 베스트 XI·MVP + 이달의 감독 (빅5) — 체크리스트

## 1. 베스트 XI 엔진 리그 확장
- [x] `getTeamOfDay` 에 옵션 인자(league·from·to) 추가 — 기본값은 월드컵/하루로 유지
- [x] 클럽 리그 분기: 국가명·국기 → 팀명(toKoreanTeamName)·팀 로고
- [x] 검증: 월드컵 호출 결과가 수정 전과 동일(회귀 0)

## 2. 주간 베스트 XI 산출
- [x] `src/lib/soccer/weekly-best-xi.ts` — 리그 + 지난 7일 창으로 XI·MVP·경기 목록
- [x] MVP = XI 중 최고 평점(동점 시 골 → 도움)
- [x] 최소 표본 게이트: 그 주 완료 경기 3경기 미만이면 발행 skip
- [x] 검증: 라리가 실데이터로 XI 11명·포지션 구성 확인

## 3. 발행 잡
- [x] `src/prompts/weekly-best-xi.ts` — 프롬프트(수치는 제공값만, 이모지 금지)
- [x] `src/jobs/generate-weekly-best-xi.ts` — 빅5 루프, slug 로 멱등, ANALYSIS
- [x] package.json 스크립트 등록
- [x] 검증: --dry 로 5리그 브리핑 출력, 수치 대조

## 4. 이달의 감독 리그 확장
- [x] `generate-manager-month.ts` LEAGUE 하드코딩 → --league 인자(기본 EPL)
- [x] cron 라우트도 리그 순회
- [x] 검증: --dry-run 으로 빅5 후보 팀 산출 확인

## 5. 배포
- [x] vercel.json cron 등록 (주간·월간)
- [x] CRON_REGISTRY 등록 (감시봇이 미실행 감지하도록)
- [x] tsc + npm test
- [x] 커밋·push

## 6. 첫 발행
- [x] 표본 확인 — 개막 직후라 팀당 1~2경기. 9월 첫 주부터가 자연스러움
- [x] 첫 편 팩트체크 후 발행 — laliga-weekly-xi-2026-08-19 (#3915) PUBLISHED, 운영 200 확인

## 실행 중 추가로 잡힌 것
- [x] `af-lineup-fetch` 의 AF_LEAGUE_ID 가 EPL 하나뿐이었다 → 빅5 + 챔피언십 등록
- [x] `normTeam` 이 분음부호를 접지 않아 "Bayern München"→"bayernmnchen" 별칭을 붓고 있었다
      → NFD 분해 추가. af "Deportivo La Coruna" ↔ 우리 "Deportivo" 는 별칭으로 처리
- [x] EPL·세리에A·리그앙·분데스 af 팀명 대조 — 개막을 기다리지 않고 af `/teams` 로 선제 감사(4콜).
      **빅5 전부 미매칭 0** (NFD 분해 + Deportivo 별칭으로 이미 해소돼 있었다).
      라리가만 우리 DB 가 21팀 — 초과 1건은 강등팀 `Real Oviedo`(26/27 경기 0). Team.league
      라벨 롤오버 미반영 건이라 이 작업 범위 밖 → [[team-league-label-rollover]] 참조, 손대지 않음
