# 하키 배당 온보딩 — 체크리스트 (2026-09-03)

- [ ] The Odds API `LIIGA` 키 추가 (`src/lib/odds/odds-api.ts` SPORT_KEY)
- [ ] 내부 매핑 라우트 `?sport=hockey` (volleyball-matches-with-ts-mapping 재사용)
- [ ] 저장 라우트: 하키(NHL 제외) bet365 eu → marketHome/marketAway 반영
- [ ] `lightsail-worker/hockey-odds-poller.js` + systemd 유닛 (배구 폴러 복제)
- [ ] /odds 하키 탭 (page.tsx SPORT_CFG·tabs·MARKET_LABELS)
- [ ] tsc 통과
- [ ] Vultr 배포 (scp src/ + 유닛, enable --now) + 로그 확인
- [ ] 운영 검증: LIIGA Odds API 매칭 수 · ts 하키 배당 insert · /odds?sport=hockey 본문
- [ ] 커밋·푸시
