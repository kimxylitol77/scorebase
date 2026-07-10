# 배당 허브 (`/odds`) — 전체 계획

> oddsportal 스타일 배당 몰아보기. 축구 먼저 완성 → 야구·농구 확장.
> 팀명 한글화 + 리그/팀 로고 포함. (2026-07-10 착수)

## 최종 목표

종목(축구·야구·농구) 경기 목록을 배당 중심으로 나열. 경기 펼치면 **배당업체별** 배당을 마켓 탭(1X2/오버언더/핸디캡)으로 비교. 경기 클릭 시 상세 배당 변동 그래프.

## 데이터 전략 (확정)

- Match 에 `oddsBookmakers` JSON 컬럼 추가 → 업체별 배당(3마켓) 저장. **prisma db push 필요.**
- `fetch-odds` 가 이미 The Odds events 의 bookmakers 를 받아옴 → 평균만 쓰고 버리던 걸 이 컬럼에 저장. **credit 추가 0.**
- 야구/농구도 SPORT_KEY 에 MLB/KBO/NPB/NBA 매핑 있음 → 같은 파이프라인으로 업체별 저장 가능.

## Phase 1 — 축구 (이번 세션)

- [x] 스키마 `Match.oddsBookmakers Json?` 추가 (db push 대기)
- [ ] `fetch-odds` — ev.bookmakers 를 3마켓(h2h/totals/spreads)으로 정리해 `oddsBookmakers` 저장
- [ ] `/odds` 라우트 — 축구 경기 목록(리그별) SSR
- [ ] 경기행 컴포넌트 — 최고 1X2 요약 + 드롭다운
- [ ] 드롭다운 — 마켓 탭(1X2/오버언더/핸디캡) 업체별 표, 최고배당 강조, 라인 최빈 묶음
- [ ] 팀명 한글화 (조사: toKoreanTeamName / team-names.ts)
- [ ] 리그 헤더 (LEAGUE_DISPLAY + 국기/로고)
- [ ] 팀 로고 (조사: TeamBadge)
- [ ] 배당 변동 차트 연결 — 이미 `LiveOddsCard` 강화 완료(커밋 대기)
- [ ] db push (승인 재확인) + 배포

## Phase 2 — 야구·농구 확장

- [ ] fetch-odds 야구/농구 `oddsBookmakers` 저장 (MLB/KBO/NPB/NBA)
- [ ] 야구 마켓: 머니라인/런라인/오버언더 (핸디=런라인). 농구: 머니라인/스프레드/오버언더
- [ ] `/odds` 종목 탭 활성화 (축구/야구/농구)
- [ ] 종목별 마켓 라벨 차이 반영 (무승부 유무 등)

## 이미 완료 (커밋 대기 중 — 배당 변동 차트)

- `LiveOddsCard` Sparklines → 큰 배당 변동 차트 (축·시각·현재값)
- `snapshot-store` getOddsHistory 3h→72h + 킥오프 이후 제외
- `fetch-odds` OddsSnapshot 적재
- `vercel.json` odds cron 6시간마다

## 안 하는 것

- 업체별 배당 "변동 이력"(시계열) — MVP 는 현재 스냅샷만. (1X2 평균 변동은 OddsSnapshot 으로 이미 있음)
- 목록에서 라이브 in-play 업체 배당 실시간 — cron 주기 기준

## 재사용/조사 (context-notes.md)

- 팀명 한글화, TeamBadge(팀 로고), 리그 로고, LEAGUE_DISPLAY — Explore 조사 결과 반영 예정
