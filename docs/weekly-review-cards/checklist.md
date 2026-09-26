# 체크리스트
- [x] `WeeklyTeamRow` 에 `teamId` 추가(로고 조회용)
- [x] `api/og/weekly-card/route.tsx` — mvp / top / table 3종
- [x] 로컬 렌더 3종 확인 (EPL 2026-09-22)
- [x] 주간 리뷰 잡 본문에 카드 삽입 (`insertWeeklyCards`, 팩트 게이트 뒤)
- [x] JSON-LD image + 이미지 사이트맵 (sitemap.ts images · sitemap-full.xml image:image)
- [x] `kind=heat` 주간 MVP 활동 히트맵 (경기 좌표 → 시즌 누적 폴백, MVP 카드 뒤 삽입)
- [x] tsc 통과
- [ ] 기존 9/22 발행분 5리그 백필 (사용자 확인 후)
- [ ] 화 11:00 첫 자동 발행 후 실렌더·GSC 이미지 색인 추적

## 야구
- [x] `weekly-players.ts` 집계 (KBO·NPB 로그 · MLB statsapi) — 3리그 실측
- [x] `baseball-weekly-card` 라우트 mvp / hitters / pitchers
- [x] 공용 프레임 추출 + 축구 라우트 회귀 렌더
- [x] 잡 삽입 (야구 주간 리뷰 · MLB 주간 선수) + URL 추출기 확장(절대 URL·순위 카드 포함)
- [x] 이번 주 발행분 백필 (kbo-weekly-2026-09-21 · mlb-players-weekly-2026-09-21) — 9/26 적용
- [ ] 화·월 자동 발행 후 실렌더 확인
