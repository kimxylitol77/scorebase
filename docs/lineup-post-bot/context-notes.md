# 확정 라인업 봇 — 컨텍스트 노트 (결정과 근거)

## 2026-07-15 설계 세션

- **웹 검색 예상 XI 재도전이 아니라 확정 라인업 팩트 전달로 방향 확정.**
  이적 데일리의 예상 XI 는 환각·포지션 부재로 이날 제거됨(d718d43). 확정 라인업은 예측이 아니라 틀릴 수 없음.
- **데이터는 이미 있다.** lightsail-worker/football-poller.js(Vultr 운영)가 coverage.lineup=1 인
  예정·LIVE 매치의 lineup/detail 을 수집해 /api/internal/thesports-cache 로 push 중.
  최근 3일 실측: confirmed 라인업 186건(월드컵 28, K리그 13, UCL 3 포함).
- **TS 좌표 규약 (홈 기준 실측)**: y 는 자기 골문=작음(GK y=12) → 공격 방향 증가. x 0~100 좌우.
  전술판 빌더 좌표는 반대(y 0=공격, 100=GK, formations.ts 헤더 참조) → yB = 100 - yTS.
  away 프레임이 홈 기준인지 팀별 기준인지 문서가 모호 → dry-run 에서 away GK y 로 실증할 것.
- **versus 변환은 transfer-daily 검증식 재사용**: home y=50+0.46yB, away y=50-0.46yB
  (풀피치 그대로 쓰면 22명 겹침 — post 938 실측 교훈).
- **pid 해석 경로**: OG 라우트(/api/og/lineup)가 pidsFromBoard → prisma.theSportsPlayer 로
  이름(교정사전>nameKo>영문)·사진 해석. team-squads.json 은 등번호만. 따라서 pid 는
  라인업의 TS 선수 id 그대로 넣되, TheSportsPlayer 에 없는 id 만 커스텀 이름 폴백.
- **Post.matchId 는 안전**: 글 상세의 예측 카드는 `post.pick && post.match` 게이트라
  pick 없이 matchId 만 넣으면 예측 UI 안 뜸. 중복 가드용으로 사용.
- **리그 라벨은 leagueLabel(@/lib/analysis/matches) 재사용** — 새 맵 만들지 않음.
- **경기 링크 규칙**: 축구는 `/live/{LEAGUE}/{Match.externalId}` (chatbot tools matchUrl 과 동일).
- **킬스위치를 opt-out(LINEUP_POST_DISABLED)으로 한 이유**: LLM 비용 0이라 기존
  opt-in(TRANSFER_DAILY_ENABLED 등, 과금 게이트) 관례와 달리 env 추가 없이 바로 동작해야 함.
- **후속 아이디어(v2, 이번엔 안 함)**: 직전 확정 XI 대비 로테이션 diff(lineup-adjust 쿼리 재사용),
  벤치 명단, 텔레그램 동시 알림.
