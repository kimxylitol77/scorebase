# 결정 기록

- ts detailLive.stats[0] 팀 코드 (ESPN 2026-09-29 MTL@TOR 대조): 6 유효슛 · 14 히트 · 15 페이스오프 승 · 16 FO% · 11 PIM · 4 페널티 수
  · 19 턴오버(giveaway) · 18 가로채기(takeaway) · 9 세이브. **8 은 블록이 아니다** — 값이 상대 팀 블록과 같다(자기 슛이 막힌 수).
  블록은 선수 코드 30 합계로 계산. 파워플레이 기회(13)는 ESPN 과 불일치 → 쓰지 않음.
- 사진: NHL = ts id → 영문명(nhl-player-names-haiku) → data/nhl-players.json photo(NHL 공식 mugs).
  KHL·유럽 = khl-players.json / hockey-eu-players.json photo(ts). 서버 컴포넌트에서만 읽는다(클라 번들 제외).
- 팀 색: team-colors.ts 에 NHL 32팀 brand 색 추가. 두 팀 색이 비슷하면 원정 팀을 중립 회색으로.
