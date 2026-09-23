# 체크리스트
- [x] stats-table.ts — 규정 판정·백분위(반전 지표)·파생·정렬·페이지, 테스트
- [x] /baseball/stats page.tsx — 필터·정렬·표·비교 바·페이지네이션, 라이트/다크
- [x] 진입 링크(랭킹 페이지·야구 허브)·sitemap 확인
- [x] 로컬 실렌더: KBO 타자 정렬·MLB 투수 경기당·NPB 검색·비교 2명·규정 토글
- [x] tsc·테스트(4/4) → 커밋 61c665c → main push → 운영 /baseball/stats 확인 → 메모리 baseball-stats-table
- [x] MLB 확장 열(wOBA·ISO·BB%·K% / FIP·K%·BB%·HR/9) — statsapi stats?stats=season&playerPool=ALL 타격·투구 한 콜씩, 1일 캐시, 테스트 5/5
- [ ] 축구 선수 스탯 표 — 별도 계획(docs/soccer-stats-table)
- [x] 2차: 열 메타(group·desc·headline) + 공통 컴포넌트(GroupHeader·Glossary·Leaders·Cards·Scatter) + 두 페이지 view 필 + sticky 선수 열
- [x] 2차: 로컬 실렌더(KBO 카드 50·MLB 투수 리더 12·MLB BB%×K% 산점도 339점·EPL 산점도 221점·라리가 리더) → 커밋 → push → 운영 확인

