# KBL 리그 페이지 완성 + 선수 정보 체크리스트 (2026-09-18)

목표. /leagues/KBL 을 NBA 수준(순위·선수 기록·일정·역사·글)으로, 선수는 팀 로스터 → 선수 상세(프로필·시즌 평균·시즌별·경기별)까지.
근거. KBL 공식 사이트가 쓰는 공개 API 실측(2026-09-18) — 인증 없이 Origin/Referer 헤더만 필요.
- 선수 목록 `kbl-api.sports2i.com/api/v1/players?regSc=Y&listCn=300` (170명, playerNo·팀코드·등번호·포지션·키·몸무게·드래프트)
- 프로필 `players/profile/{season}/{playerNo}` (생년월일·국적·학교), 시즌 평균+리그 순위 `players/categories/avg/{season}/{playerNo}`
- 시즌별 `players/categories/season/{playerNo}`, 경기별 `players/categories/game/{season}/{?}/{playerNo}`
- 전체 선수 시즌 평균(리더보드) `api-stats.kbl.or.kr/api/records/player/general/traditional`
- 사진 `https://kbl.or.kr/files/kbl/players-photo/{playerNo}.png`

## A. 선수 사전·로스터
- [x] scripts/build-kbl-players.ts → data/kbl-players.json (목록+프로필, 팀코드→Team.id), weekly-static-refresh 등록
- [x] src/lib/sports/kbl-players.ts 로더 + 팀 페이지 KBL 로스터(가드/포워드/센터, 사진·등번호·키·몸무게·나이·드래프트)
## B. 선수 상세
- [x] src/lib/sports/kbl-api.ts (런타임 fetch + unstable_cache) — 프로필·시즌평균(순위)·시즌별·경기별
- [x] /players/{playerNo}?league=KBL — KblViews(개요/시즌별/경기별) + generateMetadata + PLAYER_PAGE_LEAGUES 등록
## C. 리그 페이지
- [x] /leagues/KBL 뷰 확장 — 순위·선수 기록(stats)·일정·역사·글, LEAGUE_INFO·메타
- [x] 선수 기록 리더보드 일일 갱신 — fetch-league-leaders runKbl(api-stats, 시즌 자동 판정), 개막 전엔 지난 시즌 최종 라벨
- [x] 역사 — KBL 챔피언결정전 우승 연혁(data/league-champions.json) 출처 확인 후 등재
## D. 마무리
- [ ] tsc·테스트·실렌더 → 커밋·push → 메모리

## 실측 (2026-09-18 dev)
- 선수 사전 170명(10팀 14~19명), 생년월일 170, 공식 한글 팀명 포함. 사진은 kbl.or.kr 정적 경로
- 리더보드 runKbl: 규정 충족 101명 → PTS/REB/AST/STL/BLK 각 10 (2025-26, 워니 23.2·마레이 14.2·허훈 6.9)
- 렌더: /players/291001?league=KBL(개요 15부문+리그 순위·시즌별 9시즌·경기별 33경기) · /teams/607780 로스터 19명 · /leagues/KBL 순위·통계·일정·역사
- 함정: api-stats listCn 은 tinyint(128 이상 500) → 120 페이지 · 팀명 사전 없어 영문 노출 → team-names KBL/WKBL 추가
