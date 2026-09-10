# 컨텍스트 노트

- **즐겨찾기 정본은 localStorage, 서버는 미러.** `MyFavoriteTeams` 가 변경 시 `/api/favorites/teams` PUT 으로 `UserTeamFollow` 를 동기화한다. 서버 렌더 페이지는 미러만 볼 수 있으므로, 서버에 팀이 0개면 "마이페이지 즐겨찾기 팀에서 추가" 안내로 유도한다(로컬에만 있는 구계정은 한 번 토글하면 미러가 채워진다).
- `UserTeamFollow.teamId` 는 문자열이지만 값은 `Team.id`(Int) 를 문자열화한 것("1549"). Number 변환 후 `homeTeamId/awayTeamId in` 로 조회.
- 적중률 산식은 `/predictions/accuracy` 와 동일 관례 — `predCorrect not null` 인 채점 경기만, 시장별 `rateOf`, Strong 은 `strongPickThreshold(league)`. 리그 요약은 `statForLeague` 그대로 호출해 숫자 단일 출처 유지.
- 누적 곡선은 `CumulativeAccuracyChart` 재사용. 리그는 30경기 뒤부터 곡선을 시작하는데 팀은 표본이 작아 **10경기 뒤부터**, 표시 자격 표본 10 이상.
- 선수 즐겨찾기 축은 없다(팔로우 모델 부재 + 예측이 경기 단위). 요청문의 "선수" 는 팀·리그로 갈음하고 보고에 명시.
- 실계정(첼시·맨유, 채점 84경기) 검증. 합산 1X2 46%(39/84) — 두 팀 맞대결은 한 경기로 센다(47+39=86 ≠ 84). OU 64~67%·핸디 51~55%. Strong 은 0/0 — EPL 임계 이상 확률이 두 팀 경기에 없었다는 뜻이라 대시로 표시.
- dev 렌더 검증은 `server-only` 때문에 `createUserSessionCookie` 를 tsx 로 못 부른다 — 같은 HMAC(USER_SESSION_SECRET ?? ADMIN_SECRET)으로 스크래치에서 직접 서명해 쿠키를 만들었다. 정상·빈 계정 200, 비로그인은 `/login?from=/account/hit-rate` 307.
