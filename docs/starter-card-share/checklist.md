# 선발 매치업 카드 개별 공유 — 체크리스트

- [x] OG 카드 이미지 라우트 `/api/og/starter-card?m={matchId}` (1200×630, 투수 사진·지표·AI 승률)
- [x] 카드 렌더 공용 컴포넌트 `components/predictions/StarterMatchupCard.tsx` 로 추출
- [x] 목록 페이지 `/predictions/starters` — 카드마다 공유 버튼 + 게시판에 올리기
- [x] 단일 카드 공유 페이지 `/predictions/starters/[matchId]` (og:image = 그 카드)
- [x] 게시판 글쓰기 프리필 `/community/new?starter={matchId}` (본문에 카드 이미지 첨부)
- [x] `npx tsc --noEmit` · eslint 통과
- [x] 로컬 dev 실렌더 확인
  - 목록: 카드 12+건, 액션 행 데스크톱 1줄(41px)·모바일 2줄(77px), 가로 오버플로 없음
  - 단일: /predictions/starters/2470 (양창섭 vs 시라카와) 렌더 + og:image 절대 URL
  - OG: 2470 정상 · 선발 미정(2472) 이니셜 fallback · 없는 id 는 Scorebase fallback
  - 프리필: 본문 수치가 DB 실측과 일치 (ERA 3.73/5.77 · WHIP 1.31/1.66 · K/9 7.1/7.3 · 최근 1.62/9.28)
