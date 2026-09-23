# 체크리스트
- [x] StatsExplorer 공용 탐색기 + 야구·축구 페이지 재작성(로컬 실렌더 동일 확인: KBO 123명·MLB 투수 리더 12·EPL 산점도 221점)
- [x] NHL 표 — 스케이터 644/940 규정·골리 51 (2025-26 최종), 히트·블록 리얼타임 조인
- [x] KBL 표 — 2025-26 규정 22경기 130명, 사진·선수 페이지 링크
- [x] LoL 표 — LCK 규정 24세트 50명(Chovy KDA 4.52), LEC·LCS 포함, LPL 제외
- [x] 허브 링크(하키·농구) · 표 상호 링크
- [x] tsc·테스트(330/330) → 커밋 6798a2d → main push → 운영 확인(하키 644/골리 51·KBL 130·LCK 50·야구 카드·축구 리더) → 메모리 stats-tables-all
- [ ] 후속: NHL 한글 선수명 사전 확장(현재 라이브 사전 범위만), KHL·WKBL·V-리그·NBA 는 소스 확보 후

## 추가 (2026-09-23) — KHL
- [x] ts 인가 범위 실측 (시즌 선수 통계 미인가, detail_live 만)
- [x] `/hockey/stats?league=KHL` 캐시 집계 로더·열 부분집합·리그 필
- [x] dev 4개 뷰 렌더 확인 (표·리더·카드·골리)
- [x] 배포·운영 확인 (9/23 운영 KHL 표·골리·리더 200, 69경기 403명)

## 추가 (2026-09-23) — 진입 연결·SEO·GEO
- [x] 링크 정본 stats-table-links.ts (리그 칩·sitemap 공용)
- [x] 5페이지 BreadcrumbList + Dataset JSON-LD, openGraph, keywords
- [x] sitemap 29 URL (canonical 과 동일)
- [x] 헤더 네비 5링크, 리그 페이지 데이터 칩, llms.txt 섹션
- [x] 배포·운영 확인 (9/23 운영 5페이지 JSON-LD·OG·keywords, sitemap 29, llms, 네비 5, LOL 칩)

