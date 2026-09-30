# 아시안게임 대회 페이지 패키지 통일 (2026-10-01)

## 왜
- 사용자 지적: 축구(ASIAN_GAMES_FB)만 순위 허브·대진표·통계가 있고 농구·배구·야구 5개 대회는 일정뿐이었다. "만들 때 한 번에 같이, 패키지로."
- 한 대회를 올리면 형제 대회(남녀·종목)를 같은 탭 묶음으로 맞추는 게 기본이다.

## 패키지 = 탭 묶음
순위(허브: 최종 순위·빅매치·조별 카드) · 대진표 · 일정 · 통계(선수 기록 원천이 있을 때) · 글(글이 있을 때)

## 구성
- `lib/sports/asian-games-multi.ts` — 5개 대회 조 표(배구·야구 = ts season/table/detail, 농구 = 경기 결과 계산) + 결선 판정
- `lib/sports/asian-games-knockout.ts` — 결선 라운드·메달 판정(끝난 대회는 결승에서 역추적, 진행 중엔 농구만 앞으로 세기, 야구는 2라운드 1·2위 = 결승)
- `lib/sports/basketball/asian-games-standings.ts` — 농구 조 편성(ts stage_id 첫 단계 = 조별리그)
- `components/leagues/asian-games/AsianGamesMultiHub.tsx` — 축구 허브와 같은 부품(SpotlightSection·GroupSegments)
- `app/leagues/[league]/page.tsx` — AG_MULTI 5개 대회 탭 묶음
