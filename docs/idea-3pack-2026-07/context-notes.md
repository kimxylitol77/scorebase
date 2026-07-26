# 컨텍스트 노트 — 아이디어 3종 (2026-07-26 시작)

작업 중 내린 결정과 근거. 다음 세션은 이 파일부터 읽을 것.

## 결정 기록

- **순서 2→3→1.** 2는 기존 pred* 값 노출이라 최소 개발, 3은 자동 발행 파이프라인에 섹션 추가, 1은 UI+OG+에셋으로 가장 큼.
- **ABS 데이터 소스 확정.** `https://baseballsavant.mlb.com/leaderboard/abs-challenges?gameType=regular&year=YYYY&challengeType=batter|pitcher|catcher&level=mlb&minChal=N&csv=true` — 2026-07-26 실측 200 OK, text/csv. 핵심 컬럼: `entity_name, team_abbr, n_challenges, n_overturns, rate_overturns`(성공률), `total_vs_expected`. 비공식이므로 실패 시 섹션 생략하는 방어 필수.
- **1번 공유 카드 아키텍처.** 힉스필드는 런타임 호출 불가(사이트에서) → 배경 템플릿 1장을 힉스필드로 생성해 public/ 에 커밋, 동적 수치는 satori(/api/og) 오버레이. 기존 api/og/* 패턴 재사용.
