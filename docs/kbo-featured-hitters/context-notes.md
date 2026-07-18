# KBO 주목 타자 Top 3 — 컨텍스트 노트

## 설계 결정

- **LLM 0 (결정론 발행)**. MLB 주간 베스트에서 "LLM 숫자 대조 불안정" 교훈 확인됨.
  선정은 어차피 수식이고 근거 한 줄은 템플릿 조립으로 충분. 비용 0, 환각 0.
- **파크팩터는 순위에 미사용**. 같은 경기 양 팀 타자에게 동일 곱이라 경기 내 Top 3 순위가
  안 바뀜. 근거 문구의 구장 맥락(타자 친화 ≥1.03 / 투수 친화 ≤0.95)으로만 사용.
- **점수 = 시즌 OPS × 상대 선발 보정**. 보정 = 1 + (eff − 4.3) × 0.06, eff = 상대 선발
  FIP ?? ERA, 클램프 [0.88, 1.15]. 선발 미확정이면 1.0 (중립).
- **출장 필터 = 풀 내 최다 출장 × 0.55**. 고정 경기수 대신 상대 기준 — 시즌 초에도 동작.
- **타순 미사용**: KBO 확정 타순 소스가 코드에 없음 (탐색 확인). 시즌 스탯 풀에서 선정.
- **선수 링크**: BaseballPlayerSeasonStats.externalId(KBO playerId) → /players/{id}?league=KBO
  (generate-previews 의 기존 관례와 동일).
- **발행 형태 = Article(type=ANALYSIS, league=KBO) 하루 1편** (경기별 글 5편이 아니라 —
  thin content 회피, /analysis 페이지·색인 자산). slug `kbo-featured-hitters-YYYY-MM-DD` 멱등.
- **크론 KST 12:15**: baseball-starters 가 UTC 01:30~03:00 에 선발을 채운 뒤. 선발이 그래도
  없으면 해당 경기는 보정 중립으로 발행 (경기 스킵 아님).
- **Threads/X 카드 배포는 보류**: threads-queue 는 현재 FEATURE 로테이션 하루 1건 정책이라
  kind 추가는 포스팅 정책 변경 — 사용자 결정 필요. 후속으로 기록.

## 구현 중 발견 (탐색 보고와 달랐던 것)
- **BaseballPlayerSeasonStats.teamName 은 축약형**("KT"·"키움") — 스키마 주석의 "정규화
  한글명"과 달리 toKoreanTeamName 이 KBO 축약형을 못 바꿔 그대로 저장돼 있었음.
  → 빌더는 kboFullNameToAbbr(신설 export) + 부분일치로 매칭. 기존 소비처
  (baseball-season-analysis)도 자체 부분일치로 이미 우회 중이었음.
- **KBO 타자 적재가 리그 전체 30명뿐** — HitterBasic GET 은 규정타석 상위 30(1페이지)만.
  → 수집기(fetch-baseball-season-stats)를 팀 선택 ASP.NET POST 순회로 확장(투수 인덱스와
  동일 패턴, kbo-official 의 fetchKboRecordTableForTeam 신설). 30명 → 293명. 실패 시
  기존 단일 GET fallback. 소비처는 팀별 take 제한이 있어 행 증가 안전.
- 오늘 자 starter JSON 에는 아직 fip 없음(FIP 작업 배포 전 크론이 쓴 것) — 근거 문구가
  ERA 만 표기. 배포 후 다음 starters 크론부터 "ERA x·FIP y" 로 나옴.

## 진행 로그
- 2026-07-18 설계 확정, 구현 시작.
- 2026-07-18 tsc 통과 + 실데이터 dry-run 5경기 × 3명 눈검사 통과. 발행은 크론(KST 12:15)에 위임.
