# 2026-07 아이디어 3종 체크리스트

> 계획: 이번 주 아이디어 Top 3 구현. 순서 2 → 3 → 1 (개발량 적은 순).
> 사용자 지시: 1번은 공유 가능하게 — 공유 링크 + 힉스필드로 뽑은 카드 이미지.

## 기능 2 — PREVIEW 상단 승률 바

- [ ] 기사 페이지의 PREVIEW 렌더 구조 파악 (MatchInsight 포함 여부·위치)
- [ ] 야구(KBO/MLB) PREVIEW 상단에 predHome/predAway 승률 바 1줄 컴포넌트 추가
- [ ] 축구 리그는 3분할(홈/무/원정) 처리 또는 야구 한정 결정
- [ ] tsc 통과 → 검증: 실제 PREVIEW 글에서 바 렌더 확인
- [ ] commit

## 기능 3 — MLB ANALYSIS 글에 ABS 챌린지 섹션

- [x] Savant ABS 리더보드 CSV 소스 검증 — `leaderboard/abs-challenges?...&csv=true` 200 OK
- [ ] fetch 모듈 작성 (batter/pitcher, minChal 필터, 성공률 상위 5)
- [ ] generate-analysis.ts MLB 분기에 정형 테이블 섹션 삽입
- [ ] Savant 호출 실패 시 섹션 생략 (글 발행은 계속)
- [ ] tsc 통과 → 검증: dry 실행으로 테이블 마크다운 확인
- [ ] commit

## 기능 1 — KBO 선수 백분위 비교 + 공유 카드

- [ ] KBO 선수 시즌 스탯 데이터 위치 확인 (DB vs data/json)
- [ ] 백분위 계산 로직 (규정이닝/타석 필터 포함)
- [ ] 선수 페이지에 백분위 막대 테이블 UI
- [ ] 힉스필드로 공유 카드 배경 에셋 생성 → public/ 저장
- [ ] /api/og 공유 카드 엔드포인트 (배경 + 백분위 막대 오버레이)
- [ ] 공유 버튼 (Web Share API + 링크 복사)
- [ ] tsc 통과 → 검증: 실선수 페이지 + OG 이미지 렌더 확인
- [ ] commit
