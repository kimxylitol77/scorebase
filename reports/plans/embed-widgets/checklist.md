# 임베드 위젯 2종 — 체크리스트 (2026-09-04)

- [x] `/embed/standings` 순위표 위젯 (축구, league·rows·theme)
- [x] `/embed/fixtures` 경기·AI 승률 위젯 (전 리그, league·days·limit·theme)
- [x] `LeagueWidgetCard` 클라이언트 카드 (리그 select → iframe·코드 즉시 갱신)
- [x] `/widgets` 갤러리 등록 + 메타 갱신
- [x] 푸터 "무료 위젯 임베드" 링크
- [x] 임베드에서 챗봇·PiP 플로팅 숨김 (`EmbedHidden` 래퍼, layout)
- [x] tsc 통과 · 로컬 dev 렌더 확인(EPL 순위 10행·K리그1/KBO 경기 목록·다크 테마·갤러리 select)
- [x] 운영 렌더 확인 — /embed/standings K리그1 10행·/embed/fixtures EPL 5경기 승률·/widgets 카드 2종·X-Frame-Options 미부여 확인(2026-09-04)
- [x] 커밋·푸시

## 2차 — 후속 3종 (2026-09-04, d0214e1)

- [x] 공개 순위 API 정규화 → `src/lib/standings/public-standings.ts` 로 추출(동작 무변경), 라우트는 얇은 래퍼
- [x] `/embed/standings` 전종목 — 축구·야구(KBO·NPB·MLB)·농구(NBA·WNBA·KBL·WKBL)·배구·NHL, 승률 종목은 승률·게임차 열
- [x] `/embed/accuracy?period=` — accuracy-stats 리그별 1X2 적중률, 평가 10경기 이상만, 1h
- [x] `/embed/odds-movers?sport=` — 오프닝 implied 대비 3%p 이상 움직인 향후 3일 경기
- [x] 리그 페이지 순위표 아래 "이 순위표를 내 블로그에 붙이기 →" (/widgets)
- [x] 갤러리 — 순위 위젯 리그 20개 선택, 적중률·배당 급변 카드
- [x] tsc 통과 (로컬 dev 는 Neon 풀 타임아웃으로 렌더 확인 불가 → 운영에서 확인)
- [x] 운영 검증 — KBO(승률·게임차)·NBA(컨퍼런스 그룹)·V-리그 순위, 적중률(30일 783경기 57%), 배당 급변(발렌시아-바르사 58→75%), EPL CTA, 공개 API KBO ok 10행 (2026-09-04)
