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
- [x] 테이블 생성 — `$executeRawUnsafe` 로 CREATE TABLE/INDEX 4문 직접 실행(db push 미사용). 컬럼 11개·인덱스 4개 확인
- [x] 첫 적재 실행 — **6,966행 삽입**(dry-run 예측과 일치). 재실행 시 `inserted: 0` 으로 멱등
- [x] 품질 검증 — 중복 0 · overround 중앙값 1.0502에 이상치 0행 · **킥오프 이후 스냅샷 섞임 0행** · 클로징→킥오프 간격 중앙값 1시간 · 북 49개 · 결과 HOME 3,393 / AWAY 3,363 / DRAW 210
- [x] 배포 (89995c2)

**Phase 1 완료.** 남은 건 시간 — 표본이 찰 때까지 기다렸다가 랭킹 페이지를 만든다.
현재 축구 무승부 표본이 210행뿐(≈6경기)이라 3-way 정확도 비교는 유럽 시즌이 시작돼야 의미가 생긴다.

## Phase 2. 가성비 구단 랭킹

몸값 1억€당 승점. 실측 헤타페 67.6 vs 첼시 4.6. 스키마 변경 없음.

- [x] 경로 `/rankings/value-clubs` (기존 `/rankings/ufc` 와 같은 계열)
- [x] 집계 쿼리 — PlayerMarketValue → TeamSourceId(`externalId`, `sourceId` 아님) → Team → Match. **94팀 산출**(누락 2)
- [x] 스쿼드 정의 교정 — 전원 합산 시 팀별 30~88명으로 갈려 밀란·인테르(80명)가 부당하게 하위권. **상위 25명 합계**로 고정
- [x] 시즌 경계 — Match 에 season 컬럼이 없어 7월 1일 기준으로 자르고, 표본 미달이면 직전 시즌으로 폴백
- [x] 페이지 UI — 리그별 섹션 + 앵커 네비, 1위/최하위 강조, 막대 그래프
- [x] SEO — metadata·Dataset JSON-LD·CiteBox
- [x] sitemap + **축구 네비 등록**(발견 경로 없으면 체류시간 목적 미달)
- [x] 검증 — `tsc` 통과 · 5개 리그 렌더 · 숫자가 검증 쿼리와 일치 · 콘솔 에러 0 · 로고 표시 확인
- [x] 배포 (631c395)

**Phase 2 완료.** 실측 결과 — 라리가 알라베스 61.8 vs 바르사 4.8 · EPL 풀럼 13.8 vs 첼시 3.2 ·
분데스 하이덴하임 26.9 vs 바이에른 5.5 · 리그1 브레스투아 43.9 vs PSG 5.4 · 세리에A 크레모네세 48.6 vs 인테르 7.9.

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
