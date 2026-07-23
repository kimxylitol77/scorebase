# 테니스·골프 라이브스코어 탭 체크리스트

방식: DB 수집 없이 ESPN 무료 API 를 페이지에서 직접 fetch (unstable_cache 60s).
기존 /scores DB 파이프라인은 건드리지 않고 sport 특수 분기로 렌더 (UFC 배너 패턴).

- [x] sport-leagues.ts — SPORTS 에 tennis(🎾 ATP·WTA)·golf(⛳ PGA·LPGA) 추가
- [x] espn-tennis.ts — 날짜별 ATP/WTA 매치 (선수·세트스코어·상태)
- [x] espn-golf.ts — 진행 대회 + 리더보드 top10 (+한국 선수 전원)
- [x] scores/page.tsx — sport==="tennis"/"golf" 전용 섹션 (기존 빈상태 메시지 회피)
- [x] 카드 — 테니스 매치 rows, 골프 대회 리더보드 카드 (서버 컴포넌트, 별표 없음 1차)
- [ ] tsc → 배포 → production 검증 (탭 노출·데이터 렌더)

비범위(1차): DB 수집·예측·PiP/즐겨찾기 연동·선수 한글명·상세 페이지
