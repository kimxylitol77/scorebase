# `/odds` 배당 페이지 — 체크리스트

축구 MVP. 진행하며 체크.

## 셋업
- [ ] `/odds` 라우트 신설 (`src/app/odds/page.tsx`, force-dynamic + unstable_cache)
- [ ] 축구 라이브+예정 Match 쿼리 (배당 필드 포함 select)
- [ ] `MatchOdds` 매핑 재활용해 리그별 그룹핑

## 배당 행
- [ ] `src/components/odds/OddsRow.tsx` 신규 (승무패+오버언더 인라인)
- [ ] 변동 화살표 (`openingMarket*` vs `market*` → ↑/↓/−)
- [ ] 라이브 경기 시간/HT/스코어 표시

## 필터
- [ ] 종목 탭 (축구 활성, 야구·농구·e스포츠 "준비중")
- [ ] 라이브/예정 토글
- [ ] 리그 칩

## 연결
- [ ] 행 클릭 → `/live/[league]/[gameId]` 상세 이동
- [ ] `LiveRefresher` 30초 폴링 연결
- [ ] 헤더/네비에 "배당" 진입점

## 검증
- [ ] `npx tsc --noEmit` 통과
- [ ] 로컬 preview 로 `/odds` 렌더 확인 (라이브 경기 있는 시간대)
- [ ] 배당 있는 경기 / 없는 경기 둘 다 정상 표시
- [ ] 상세 클릭 이동 확인
- [ ] scorebase-deploy 로 배포
