# 2026-07 아이디어 3종 체크리스트

> 계획: 이번 주 아이디어 Top 3 구현. 순서 2 → 3 → 1 (개발량 적은 순).
> 사용자 지시: 1번은 공유 가능하게 — 공유 링크 + 힉스필드로 뽑은 카드 이미지.

## 기능 2 — PREVIEW 상단 승률 바

- [x] 기사 페이지의 PREVIEW 렌더 구조 파악 (MatchInsight 포함 여부·위치)
- [x] 야구(KBO/MLB) PREVIEW 상단에 predHome/predAway 승률 바 1줄 컴포넌트 추가 (기존 WinProbBar 재사용)
- [x] 야구 한정으로 결정 (아이디어 범위 준수)
- [x] tsc 통과 → dev 렌더 확인 (KBO/MLB)
- [x] commit a35d400

## 기능 3 — MLB ANALYSIS 글에 ABS 챌린지 섹션

- [x] Savant ABS 리더보드 CSV 소스 검증 — `leaderboard/abs-challenges?...&csv=true` 200 OK
- [x] fetch 모듈 작성 (batter/pitcher, minChal 필터, 성공률 상위 5)
- [x] generate-analysis.ts MLB 분기에 정형 테이블 섹션 삽입 (LLM 아닌 코드가 조립)
- [x] Savant 호출 실패 시 섹션 생략 (글 발행은 계속)
- [x] tsc 통과 → 실데이터 단위 실행 확인
- [x] commit 64b8ee4

## 기능 1 — KBO 선수 백분위 비교 + 공유 카드

- [x] KBO 타자 263명 DB 확인 (투수는 미영속 — 후속 분리)
- [x] 백분위 계산 (규정 = 최다경기 60% 출장, 표본 102명)
- [x] 선수 페이지 개요 탭에 백분위 막대 섹션
- [x] 힉스필드 배경 생성 → public/bg/kbo-percentile-card.png
- [x] /api/og/kbo-percentile 카드 엔드포인트
- [x] ShareCardButton (Web Share + 복사 + 카드 링크)
- [x] tsc 통과 → 구자욱 페이지 + 카드 이미지 렌더 확인
- [x] commit

## 기능 1 후속 — KBO 투수 백분위 (v2)

- [x] prisma BaseballPlayerSeasonStats 에 투수 컬럼 추가 (era/whip/ip/so/wins/losses/saves — 전부 nullable)
- [x] prod DDL — 장기 트랜잭션 0건 확인 + lock_timeout 3s 절차로 ALTER 완료
- [x] fetch-baseball-season-stats.ts KBO 에 PitcherBasic Basic1 팀별 수집 추가 (upsertPitcher 분리 — 타자 컬럼 불가침)
- [x] KBO 투수 백필 실행 → 270명 적재 (era 유효 260)
- [x] kbo-pitcher-percentile.ts (ERA/WHIP 백분위 반전, 규정 = 최다이닝 50% → 표본 43명)
- [x] KboPercentileSection 데이터 타입 일반화 (타자/투수 겸용)
- [x] KboPitcherView 개요 탭에 섹션 추가
- [x] /api/og/kbo-percentile kind=pitcher 지원
- [x] tsc + dev 렌더 (곽빈·구자욱) + 백분위-공식 ERA 순위 대조 일치
- [x] commit 6be3a5c · 배포 완료 (2026-07-26)

## 백분위 다종목 확장 (2026-07-26)

- [x] NPB 타자·투수 — pit_{c,p} 수집 + 라이브러리 league 파라미터화 + 뷰 + OG league=NPB (b6b1388)
- [x] NHL 스케이터·골리 — stats REST 전체 1콜, playerId 매칭, DB 미영속 (e0cf5e6)
- [x] NBA — ESPN byathlete seasontype=2, 최다출장 60% 자체 규정, espnId 매칭
- [x] MLB 는 기존 Savant 퍼센타일 바로 커버 (작업 불필요), LOL 은 정적 데이터라 제외
- [x] tsc + dev 렌더 검증 (무라카미·사토·맥데이비드·헬러벅·SGA)
