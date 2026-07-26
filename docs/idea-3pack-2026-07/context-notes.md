# 컨텍스트 노트 — 아이디어 3종 (2026-07-26 시작)

작업 중 내린 결정과 근거. 다음 세션은 이 파일부터 읽을 것.

## 결정 기록

- **순서 2→3→1.** 2는 기존 pred* 값 노출이라 최소 개발, 3은 자동 발행 파이프라인에 섹션 추가, 1은 UI+OG+에셋으로 가장 큼.
- **ABS 데이터 소스 확정.** `https://baseballsavant.mlb.com/leaderboard/abs-challenges?gameType=regular&year=YYYY&challengeType=batter|pitcher|catcher&level=mlb&minChal=N&csv=true` — 2026-07-26 실측 200 OK, text/csv. 핵심 컬럼: `entity_name, team_abbr, n_challenges, n_overturns, rate_overturns`(성공률), `total_vs_expected`. 비공식이므로 실패 시 섹션 생략하는 방어 필수.
- **1번 공유 카드 아키텍처.** 힉스필드는 런타임 호출 불가(사이트에서) → 배경 템플릿 1장을 힉스필드로 생성해 public/ 에 커밋, 동적 수치는 satori(/api/og) 오버레이. 기존 api/og/* 패턴 재사용.

- **기능 2 는 컴포넌트 신설 없이 기존 `WinProbBar`(hideDraw) 재사용.** 삽입 위치 = 스코어박스 아래·스냅샷 배너 위. 예측값은 MatchInsight 와 동일한 Article 스냅샷 우선 규칙.
- **"당일 선발 반영" 라벨은 MLB 만.** KBO/NPB 는 선발 데이터 미통합이라 일반 문구 (오표기 방지).
- **ABS 투수 최소 챌린지 3회.** 투수는 챌린지 표본이 작음 (7월 기준 최다 6회). 타자는 10회.
- **KBO 백분위는 타자 v1.** 투수 시즌스탯(ERA/WHIP) DB 미영속 — BaseballPlayerSeasonStats 확장 + PitcherBasic 스크래핑이 필요해 후속 분리. 규정 = 시즌 최다 출장의 60%, 매칭 = 이름 + 팀 startsWith(동명이인 대비).
- **satori 주의.** 고정폭 요소에 flexShrink:0 필수 — 기본 shrink 로 바/배지가 겹쳐 깨졌던 것 수정.
- **미해결 관찰.** KBO 타자 페이지 `<title>` 이 "선발 투수 통계" 로 나옴 (기존 메타 버그, 이번 작업 무관).
