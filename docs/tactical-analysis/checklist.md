# 전술 분석 아티클 — MVP 체크리스트

> Post-match(경기 후 전술 리뷰) MVP 기준. 진행하며 체크.
> 설계 근거는 [context-notes.md](./context-notes.md).

## Phase 0 — 결정 확정 (코딩 전)
- [ ] Pre-match / Post-match 확정 (권장: Post-match) → 검증: 사용자 승인
- [ ] 대상 리그 확정 (EPL·LALIGA·BUNDESLIGA·SERIE_A·LIGUE_1·UCL) → 검증: 각 리그 최근 경기 fixtureStats non-null 실측
- [ ] 대상 경기 선정 기준(Elo 상위 맞대결 + 라이벌 화이트리스트) → 검증: 샘플 10경기 뽑아 타당성 확인
- [ ] 렌더 범위: 순수 Markdown MVP vs 도식 카드 → 검증: 결정 기록

## Phase 1 — 데이터 게이팅 (성패 지점) ✅ 완료
- [x] `hasTacticalData` 판정 함수 — 홈/원정 포메이션 AND xG → [src/lib/tactical/data-gate.ts](../../src/lib/tactical/data-gate.ts). tsc 통과.
- [x] 실측 검증 — 게이트 통과/탈락 정확 분리. 병목=포메이션 커버리지(인시즌 40~63%, xG는 거의 전부). 상세 [context-notes.md](./context-notes.md) Phase 1 결과.
- [ ] **결정 대기** — 게이트 강도 (A)포메이션 하드 유지 vs (B)xG만 하드. 이 결정이 data-gate.ts 를 바꿀 수 있어 커밋 보류.

## Phase 2 — 전술 컨텍스트 조립기 ✅ 완료
- [x] `buildTacticalContext(matchId)` — [src/lib/tactical/context.ts](../../src/lib/tactical/context.ts). tsc 통과, 실제 2경기로 검증.
  - [x] 홈/원정 포메이션 + 감독 (coach 문자열/객체 양형태 대응)
  - [x] 실측 xG(홈/원정) + 실제 득점 병기
  - [x] 매치스탯(점유·슈팅·유효슈팅·코너) — 선택 항목, 없으면 생략(레알전에서 확인)
  - [x] 실제 선발 11명 이름 주입
  - [x] Elo·최근폼·H2H 프레이밍 (buildMatchContext 재사용)
  - [~] 인시던트 골 타임라인 — MVP 보류(TheSportsMatchCache 별도 파싱 필요, 후행)
- [x] 빈값 주입 금지 패턴 준수 — null 필드 미주입 확인

## Phase 3 — 전술 프롬프트 ✅ 완료
- [x] `src/prompts/tactical-analysis.ts` — 헤더 한국어 주석
- [x] 구조 강제: 경기요약 / 포메이션 맞대결 / 흐름 가른 지점(xG·슈팅·점유) / 키플레이어 / 총평
- [x] 창작 금지 가드 — 데이터 밖 통계·사실 금지 명시. dry-run 샘플에서 "~것으로 보인다" 헤지 확인, 창작 없음
- [x] 최소 분량 1500자 (MIN_TACTICAL_LENGTH)

## Phase 4 — 생성 잡 ✅ 완료 (dry-run 검증)
- [x] `src/jobs/generate-tactical.ts` — generate-analysis 골격 복제, 헤더 한국어 주석
- [x] 대상 루프 + 게이트 + 중복 스킵(articles: { none: { type: "TACTICAL" } })
- [x] Claude 생성 → 임시 slug → `{league}-tactical-{id}`
- [x] 초기 `status: "DRAFT"`
- [x] 양산 가드 PER_RUN_CAP=4, LOOKBACK_DAYS=5
- [x] `--dry-run` / `--match=ID` 플래그 — 프로덕션 DB 쓰기 승인 전 안전 확인용
- [x] dry-run 실측: 비야레알 5-1 아틀레티코 → 1732자 전술글, 데이터 충실·창작 없음
- 남은 결정: 팀명 한글 음역 교정(비야레알 등) 주입 여부 — MVP 비블로커
- 남은 승인: 실제 DRAFT INSERT 는 프로덕션 DB 쓰기라 **사용자 명시 승인 필요**

## Phase 5 — 발행·렌더·색인
- [ ] Article 타입 라우팅에 TACTICAL 추가 → 검증: 상세 페이지 렌더
- [ ] JSON-LD(Article) 적용 → 검증: 리치결과 테스트 통과
- [ ] sitemap / ARTICLE_LEAGUES 화이트리스트 편입 → 검증: sitemap 에 등장
- [ ] 리스트/네비 노출 위치 결정 → 검증: 진입 경로 확인

## Phase 6 — 품질 검증 후 자동화
- [ ] DRAFT 5~10편 수동 검수 — 사실 정확성·전술 깊이·중복 표현 → 검증: 합격선 통과
- [ ] 합격 시 status 기본값 PUBLISHED 전환 → 검증: 자동 발행 1편 end-to-end
- [ ] cron 등록(빈도 확정 후) → 검증: 스케줄 1회 정상 동작

## 절대 하지 말 것
- 데이터 없는 경기에 LLM 일반론글 생성(= thin content, SEO 역효과)
- 패스맵·히트맵 지표를 "있는 척" 프롬프트에 요구(데이터 없음)
- 소문자 model/DB 키 등 기존 식별자 오염
