# xG 인사이트 시리즈 컨텍스트 노트

## 배경
- 경쟁분석 봇(scout)이 xgscore.io 발굴. 직접 경쟁자는 아니지만 세 UI 패턴이 이식 가치 있음.
  1. 경기 리스트: 스코어 옆 팀별 xG + "xG Fairness %"
  2. 순위표 XG ADVANCED 탭: 득점vs xG·실점vs xGC·PTS vs xPTS ±편차 병기 → 순위의 '운' 수치화
  3. 팀 프로필: 경기당 xG 생성/허용 추이

## 데이터 결정
- 소스: 기존 `Match.fixtureStats` JSON 의 `expectedGoals` (af 수집, 카멜케이스 — snake_case 아님 주의).
- 신규 수집 없음. 최근 1년 커버리지: 라리가·세리에A 100%, 월드컵 91%, EPL 72%, UCL 70%, 분데스 58%, MLS 46%, 에레디비시 0%.
- EPL 처럼 부분 커버 리그는 xPTS 누계가 왜곡됨 → 리그 단위 커버리지 게이트(90%+) 필수.

## 계산 결정
- fairness(결과 부합도) = xG 쌍을 Poisson 독립 모델 λh, λa 로 보고 실제 결과(승/무/패)의 확률.
  - xGscore 의 fairness 공식은 비공개(역산 시도 결과 단순 |실차-xG차| 매핑 아님, 샷 단위 시뮬레이션 추정). 우리는 투명한 Poisson 결과확률로 자체 정의.
- xPTS = 경기별 3×P(승)+1×P(무) 합산. 같은 Poisson 헬퍼 재사용.
- Poisson 은 predictionEngine.ts 에 기존 구현 있으면 재사용, 노출 안 돼 있으면 소형 헬퍼 신설.

## UI 결정
- Phase 1: WcXgList 행에 부합도 % 칩. 임계 표기(높음=내용대로, 낮음=이변).
- Phase 2: 기존 순위표에 탭 토글(기본 OVERALL 유지 — 회귀 방지). xG 열은 실측치 병기 + ±편차 컬러(＋=기대 대비 초과).
- Phase 3: 팀 페이지 섹션. 데이터 없으면 미노출(soft 404 방지 차원 아님, 단순 조건부).

## UI 결정 (추가)
- Phase 2 는 탭 토글 대신 순위표 하단 상시 섹션으로. 이유: 서버 컴포넌트 유지(클라 JS 0),
  닫힌 탭보다 크롤러/GEO 노출 가치, 기본 순위표 회귀 위험 0.
- Phase 3 색: 만든 xG=emerald-500(다크 emerald-600), 허용 xG=rose-500.
  dataviz 팔레트 검증 통과(라이트 CVD ΔE 19.2, 다크는 emerald-600 으로 밴드 통과).
  콘트라스트 WARN 해소 = 최근 경기만 선택적 직접 라벨 + 범례 + 페어 내 위치(왼=생성) 이중 인코딩.

## 후속 (같은 날)
- EPL xG 백필: scripts/backfill-fixture-xg.ts (시즌 fixture 1콜 매핑, 코너 백필 패턴).
  1차 66건 후 39건 미매칭 전원 울버햄튼 — af 명 "Wolves" 가 teamsMatch startsWith 로 안 잡힘.
  teamsMatch 에 ALIAS(wolves→wolverhampton) 추가 후 37건 추가. 최종 378/380(99.5%) 게이트 통과.
  잔여 2건은 af 통계 자체 부재. 분데스(58%)·UCL(70%)·MLS(46%)도 같은 스크립트로 백필 가능(미실행).
- 매치 상세 부합도: MatchStatsCard xG 블록(경기 기록 탭)에 "결과 부합도 N%" 라인 추가.
- 주의: /standings 의 xG 심화 게이트는 DB 동적 계산이라 EPL 백필만으로 프로덕션에도
  섹션이 뜬다(코드 배포 불필요, ISR 10분). 매치 상세 부합도만 배포 필요.

## 세션 로그
- 2026-07-18: 문서 생성. Phase 1~3 + 후속(EPL 백필·매치 상세 부합도) 구현·검증·커밋 완료.
