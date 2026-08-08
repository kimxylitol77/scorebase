# 축구 선수 개인페이지 빙 SEO — 체크리스트 (2026-08-08)

문제: 축구 선수 실페이지는 `/transfers/{id}`(af→ts 매핑 3,455명 redirect)인데
① 제목이 몸값 검색어만 커버 ② sitemap 600명(빅5만, 손흥민 0건) ③ IndexNow 미제출.

- [x] A. `/transfers/[id]` generateMetadata 개편 — `{이름} 프로필 — {팀} {포지션} · 시즌 {골}골 {도움}도움 · 몸값 €{val}M` (SEASON json 재사용, API 비용 0). dev 실측: 손흥민·이강인·김민재 신제목 확인
- [x] B. sitemap 축구 선수 확대 — 빅5 상위 600 → 리그 판명 + 몸값 보유 전원(~4,094명, MLS·사우디·K리그1 포함). dev 실측: /transfers/ 4,094건 + 손흥민 포함
- [x] C. IndexNow cron 에 몸값 갱신 선수 URL 추가 (26h 내 updatedAt, 실측 일 0~7건 수준). dev 실행: ok=true, players=0(26h 변동 0건과 일치)
- [x] typecheck 통과
- [x] 커밋 3건(A/B/C) + push — a876777 · 0d55e0b · d68eb0b
- [x] production 실측 — 제목 `손흥민 프로필 — LAFC 공격수 · 시즌 4골 8도움 · 몸값 €15M · 이적 기록` + sitemap 손흥민 포함 확인 (08-08)
