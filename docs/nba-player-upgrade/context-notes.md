# NBA 선수 페이지 업그레이드 — 컨텍스트 노트

## 배경
- 사용자가 축구/야구 선수 페이지를 동시 업데이트 중. 농구도 대칭시키는 작업.
- 축구 작업: ① 통산요약헤더 ② 90분당지표 ③ 레이더육각 ④ 시즌추이 라인차트
- 야구 작업: P1 레이아웃톤 · P2 리그평균순위배지 · P3 커리어추세선 · P4 Statcast 히트맵
- 농구 매핑 확정: per-36(축구 per-90 대응) + 시즌추이 라인차트 + 부상이력 축적

## 결정 로그
- **추이차트 = 농구 전용 신설**. 축구 `src/app/transfers/[id]/CareerTrendChart.tsx`,
  야구 `src/app/players/[pid]/BaseballTrendChart.tsx` 는 진행 중이라 안 건드림.
  공용화는 세 개 안정 후 별도. (외과적 변경 원칙)
- **부상 = 이력 축적(신설)** 선택됨.
  - `fetchEspnInjuries("NBA")` 는 현재 부상명단 스냅샷일 뿐 시계열 이력 아님.
  - 축구 PlayerEvent 파이프라인은 playerId=TheSports 이적시장 id 기반 →
    NBA(BDL/ESPN id)와 id 체계 불일치라 재사용 불가.
  - 결론: ESPN id 키로 NBA 전용 스냅샷 적재 파이프라인 신설. 오늘부터 축적(과거 없음).

## 데이터 근거
- `NbaSeasonRow` (espn-nba-player.ts): year,label,teamSlug,gp,gs,min,pts,reb,oreb,dreb,
  ast,stl,blk,to,pf,fgPct,fg3Pct,ftPct — 전부 시즌 평균(per game).
- per-36 = stat / min * 36 (career.min 기준).
- 통계 소스: BDL 기본정보 · ESPN 통계/시즌/스플릿/수상 · TheSports 연봉/생일.
- 부상 소스: `src/lib/sports/espn-injuries.ts` fetchEspnInjuries(NBA|MLB|NHL),
  리그 단위 현재 부상명단. 필드: playerId(ESPN athlete id), playerName, reason(부위 한글추출),
  status(Out/Day-To-Day/Injured Reserve), teamName, fixtureDate.

## 함정 주의
- BDL 분당 5회 한도 → 429 잦음. profile 없으면 로컬 로스터 fallback.
- db push 프로덕션 hang 이력 → 컬럼추가는 ALTER, 사용자 Neon SQL 경유 고려.
