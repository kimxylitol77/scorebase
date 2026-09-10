# 개인 적중률 노트북 — 계획 (2026-09-10)

**무엇.** 회원이 즐겨찾기한 팀(·리그)에 대한 AI 예측 적중률을 자동 누적해 보여주는 뷰. `/account/hit-rate`.
근거 경쟁사 statpair.com 의 "personal hit-rate notebook".

**왜.** 전체 리그 적중률(`/predictions/accuracy`)은 남의 숫자다. "내 팀에서 AI 가 얼마나 맞았나"는 회원이 매주 돌아올 이유가 된다. 재료(predCorrect·즐겨찾기 서버 미러)가 이미 있어 난이도 하.

**범위.**
- 입력. `UserTeamFollow`(팀)·`UserLeagueFollow`(리그) — 둘 다 서버 미러. 선수 즐겨찾기는 모델이 없고 예측이 경기 단위라 **선수 축은 제외**.
- 출력. 팀별 1X2·OU·핸디·Strong 적중률 + 최근 10경기 적중 도트, 팀별 누적 적중률 곡선(기존 `CumulativeAccuracyChart` 재사용), 팔로우 리그 요약(기존 `statForLeague` 재사용), 최근 채점 경기 12건(AI 픽·결과·적중).
- 마이페이지 `/account` 에 진입 카드 1개.

**하지 않는 것.** 새 테이블·집계 잡 없음(렌더 시 조회, force-dynamic). 알림·공유 카드 없음.
