# 하키 배당 온보딩 — 체크리스트 (2026-09-03)

- [x] The Odds API `LIIGA` 키 추가 (`src/lib/odds/odds-api.ts` SPORT_KEY)
- [x] 내부 매핑 라우트 `?sport=hockey` (volleyball-matches-with-ts-mapping 재사용)
- [x] 저장 라우트: 하키(NHL·LIIGA 제외) bet365 eu → marketHome/marketAway 반영
- [x] `lightsail-worker/hockey-odds-poller.js` + systemd 유닛 (배구 폴러 복제)
- [x] /odds 하키 탭 (page.tsx SPORT_CFG·tabs·MARKET_LABELS)
- [x] tsc 통과
- [x] 커밋·푸시 (3f86fad)
- [x] Vultr 에 파일·유닛 scp + daemon-reload (md5 일치 확인)
- [x] Vercel 배포 후 폴러 enable --now — 첫 폴 matches=74 ok=38 inserted=2983 pushFail=0
- [x] 운영 검증 — LIIGA Odds API 매칭 6/6 · ±2일 marketHome CHL 12/12·친선 10/47·LIIGA 4 ·
      /odds?sport=hockey 본문에 LIIGA 6경기 렌더. KHL 1경기·덴마크·벨라루스는 ts 배당 아직 없음(소스 사정).
