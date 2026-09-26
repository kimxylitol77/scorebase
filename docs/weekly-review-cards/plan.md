# 주간 리뷰 인포그래픽 카드 — 계획

## 왜
- 빅5 주간 리뷰(ANALYSIS, 화 11:00)가 텍스트만이라 가독성이 낮고, 구글 이미지·SNS 노출 자산이 없다.
- 데이터(평점·골·도움·선수 사진·팀 로고·시장 기대 승점·몸값)는 이미 DB·JSON 에 있고, satori(`next/og`) 카드 인프라도 있다(`api/og/*`).

## 무엇
1. `/api/og/weekly-card?league=EPL&end=YYYY-MM-DD&kind=mvp|top|table` — 1080×1350 세로 카드 3종.
   - `mvp` 주간 MVP 선수 히어로 카드(사진·평점·골·도움·몸값·소속).
   - `top` 주간 평점 TOP 10 리더보드(순위·이름·팀 로고·평점·G/A) + MVP 사진.
   - `table` 팀 주간 승점표(로고·승무패·득실·승점·시장 기대 대비 ▲▼).
2. 주간 리뷰 잡이 본문 마크다운에 카드 3장을 섹션별로 삽입(alt 텍스트 = 한국어 설명).
3. 구글 이미지 색인: 글 JSON-LD `image` 배열에 카드 URL 추가 + 이미지 사이트맵 + alt/캡션.

## 검증
- 로컬 dev 에서 EPL 2026-09-22 카드 3종 렌더 → PNG 육안 확인.
- `npx tsc --noEmit` 통과.
- 잡 `?dry=1` 로 본문에 이미지 3줄 + 팩트 게이트 통과 확인.

## 2단계 — 야구 (2026-09-26)
- `/api/og/baseball-weekly-card?league=KBO|NPB|MLB&end=&kind=mvp|hitters|pitchers` — 이주의 선수(OPS 1위 타자 + ERA 1위 투수), 주간 타자 TOP 10, 주간 투수 TOP 8.
- 집계 `src/lib/sports/baseball/weekly-players.ts` — KBO·NPB 는 경기별 선수 로그 합산, MLB 는 statsapi 주간 스플릿 빌더 재사용.
- 삽입: KBO·NPB 주간 리뷰(핫이슈 아래 이주의 선수, 팀 지표 아래 타자·투수), MLB 주간 베스트 선수 글(MVP·타자·투수 섹션). MLB 팀 주간은 순위 카드만(전용 선수 글이 있어 중복 방지).
- 공용 프레임 `src/components/og/weekly-frame.tsx` 로 축구·야구 카드 헤더·아바타·타일 통일.
