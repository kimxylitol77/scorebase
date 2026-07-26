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

## 투수 백분위 v2 (2026-07-26)

- **투수 컬럼 7개를 BaseballPlayerSeasonStats 에 추가** (era/whip/ip/so/wins/losses/saves, 전부 nullable). prod DDL 은 장기 트랜잭션 0건 확인 후 lock_timeout 3s 트랜잭션으로 실행 완료. ip 는 십진 변환 저장 ("104 1/3" → 104.333, `ipToInnings` 재사용).
- **투수 upsert 는 upsertPitcher 분리** — 타자와 같은 테이블·unique key 지만 update 블록이 타격 컬럼을 건드리지 않게 격리 (동명이인 충돌 시 타격 스탯 보존). 데이터 소스는 PitcherBasic Basic1 단일 페이지 (ERA/G/W/L/SV/IP/SO/WHIP 전부 포함, 팀별 POST 순회).
- **규정 = 시즌 최다 이닝의 50%.** 공식 규정이닝(팀 경기수×1)은 표본 ~25명으로 과소 — 50% 기준 실측 43명 (사실상 선발 전원 + 다이닝 불펜). 표본 15명 미만이면 섹션 생략. ERA/WHIP 는 백분위 반전 (`lowerIsBetter`).
- **지표 5종 = ERA·WHIP·K/9·탈삼진·승리.** 세이브는 규정 표본이 선발 위주라 제외 (컬럼은 적재해 둠 — 불펜 전용 뷰 후속 가능).
- **검증 실측.** 공식 ERA 순위(최민석 2.49 → pct 100, 올러, 곽빈)와 순서 일치. 곽빈 탈삼진 pct 100 = 리더보드 배지 "탈삼진 리그 1위" 와 정합. 백필 결과 투수 270명 (era null 제외 260).
- **OG 카드는 kind=pitcher 파라미터** 로 동일 라우트 재사용. KboPercentileSection 은 타자/투수 유니언 타입 — 규정 문구만 `"minGames" in data` 분기.
