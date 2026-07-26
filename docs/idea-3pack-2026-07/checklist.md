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
