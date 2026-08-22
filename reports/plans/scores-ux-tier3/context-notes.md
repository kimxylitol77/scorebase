# 컨텍스트 노트 — 3순위
## 결정
- **CLV** — `MatchVote.pickOdds/closeOdds/clv` 추가(운영 DDL 은 lock_timeout 3s 로 직접 ALTER, db push 안 씀). 투표 POST 가 `Match.odds*`(마진 포함 해외 평균) 픽 쪽을 저장, `score-match-votes` 가 킥오프 이전 마지막 OddsSnapshot 으로 종가·clv 채움(스냅샷 없으면 건너뜀, 추정 금지). /picks·/picks/me 에 플랫 1u 수익·ROI·평균 배당·평균 CLV 카드 + 표 열. 과거 표는 pickOdds 없음 → "배당 기록된 표 없음".
- **웹 푸시 3종** — 구독 API `kinds` 화이트리스트(KICKOFF·LINEUP·FINAL), 디스패처가 종류별 상태 조건(킥오프 15분 / SCHEDULED+lineupUpdatedAt / FINISHED 6h 내)으로 발송. 벨 옆 `details` 종류 선택(localStorage `scorebase:push-kinds`). 골·배당 변동은 실시간 추적 필요라 텔레그램(기존 8종 옵트인)에 둠. **함정**: 배열 스냅샷을 `useClientValue` 에 그대로 주면 무한 루프(Maximum update depth) — `useCachedSnapshot` 필수. 종류 메뉴 실렌더는 헤드리스 구독 실패로 미확인(tsc·eslint 만).
- **즐겨찾기 리그 서버 동기화** — `UserLeagueFollow` 신설(CREATE TABLE 직접), `/api/favorites/leagues` GET/PUT(ALL_LEAGUES 화이트리스트), 토글 시 `scheduleFavServerSync`, 로그인 pull/입양/로그아웃 초기화 경로 모두 연결. /scores 내 경기 헤더에 "관리 →"(/account#favorites).
- **마켓 격자** — `OddsMarketsGrid`: 수집되는 승무패·핸디캡·O/U 만 값, 전반·코너·카드·정확한 스코어는 소스 없음, BTTS·더블찬스는 Odds API Pro 전용 → "데이터 준비 중" 칩. `oddsHcLine` 은 절대값만이라 강팀(−)은 승무패 배당 낮은 쪽으로 판정.
- **/lab 축구** — 코드 배제 없음. 표본순 상위 10개 컷에 EPL 8위·라리가 9위·세리에A 10위라 조건 따라 잘림. 주력 12리그 고정 우선 + 상한 16.
