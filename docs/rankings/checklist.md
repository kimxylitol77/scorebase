# 랭킹 콘텐츠 확장 체크리스트

목표는 체류시간. 이미 쌓인 데이터를 다르게 잘라 "줄 세우기" 볼거리를 만든다.
근거 조사는 `context-notes.md`. 되는 것/불가 목록은 그쪽에 정리돼 있다.

---

## Phase 0. 완료분 (07-21 배포)

- [x] `/predictions/scorecard` 리그별 성적 (fea1a7e)
- [x] `/predictions/scorecard` 만장일치 성적 + 배신 경기 (2b96ed7)

## Phase 1. 북메이커 클로징 적재 — 시한 있음

`OddsBookSnapshot` 은 보존 14일(`odds-mover-alert` cron 이 2시간마다 삭제).
지금 적재를 안 붙이면 "북메이커 정확도 랭킹"은 영원히 표본이 안 찬다. 랭킹 자체는 3~6개월 뒤.

- [x] 새 테이블 `BookClosingOdds` 스키마 작성 → `prisma validate` 통과
- [x] 적재 dry-run → 최근 14일 종료 2,014경기 중 배당 있는 203경기 × 평균 34.3북 = 6,966행. **일 498행 / 연 18만 행 추정**
- [x] 적재 route 작성 `src/app/api/cron/closing-odds/route.ts` (DISTINCT ON 클로징 + NOT EXISTS 증분 + 500행 청크)
- [x] cron 등록 — `vercel.json` `20 16 * * *`(KST 새벽 1시 20분, 채점 cron 직후) + `CRON_REGISTRY`
- [ ] **CREATE TABLE SQL 을 Neon 콘솔에서 직접 실행** (db push 금지 원칙) ← 사용자 실행 대기
- [ ] 첫 실행 후 행 수·중복 없음 확인 → 검증: `SELECT count(*), count(DISTINCT ("matchId", book)) FROM "BookClosingOdds"`

## Phase 2. 가성비 구단 랭킹

몸값 1억€당 승점. 실측 헤타페 67.6 vs 첼시 4.6. 스키마 변경 없음.

- [ ] 경로 확정 (`/rankings/value-clubs` 안) → 검증: 기존 97개 path 와 충돌 없음
- [ ] 집계 쿼리 작성 (PlayerMarketValue → TeamSourceId → Team → Match) → 검증: 81팀 산출
- [ ] 페이지 UI + 리그 탭 → 검증: 로컬 렌더 + 숫자가 쿼리 결과와 일치
- [ ] SEO (metadata·JSON-LD·CiteBox) → 검증: 빌드 후 head 확인
- [ ] sitemap 편입 → 검증: `/sitemap.xml` 에 노출
- [ ] `tsc --noEmit` 통과 후 커밋·푸시

## Phase 3. 위키 조회수 랭킹 3종

Wikimedia Pageviews API. CC0, 키 불필요. 대상은 축구 선수만(한국 야구는 표본 무의미).

- [ ] 새 테이블 `WikiPageview` 스키마 → 검증: `prisma validate`
- [ ] CREATE TABLE SQL 사용자 전달
- [ ] QID → 위키 표제어 매핑 (ko/en 양쪽) → 검증: 샘플 20명이 실제 조회수 200 응답
- [ ] 수집 job (일 1회, `all-agents` 고정) → 검증: 3,520명 중 성공/실패 수 로깅
- [ ] 랭킹 3종 페이지 — 주간 최다 / 급등 / 한국 편애 → 검증: 로컬 렌더
- [ ] cron 등록 + sitemap → 검증: Phase 1 과 동일
- [ ] `tsc --noEmit` 통과 후 커밋·푸시

---

## 하지 않기로 한 것

- 네이버 데이터랩 (KBO·K리그 인기 랭킹) — 사용자 판단으로 계획에서 제외
- 팀·선수 단위 인기 랭킹 — k-익명성 위반
- 유입 경로(referrer) 랭킹 — 불법중계 사이트 노출 위험
- 야구 클러치, 천적, 유리몸 — 데이터 없음. 근거는 context-notes.md
