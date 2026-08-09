# KBO 경기별 선수 로그 축적 — 계획 + 체크리스트

> 위키형 데이터 축적 3단계의 마지막 미완 항목(wiki-archive-phase1/checklist.md:98).
> KBO 는 경기별 선수 기록 공식 API 가 없어 소멸 위험 데이터 — 자체 축적이 필요하다.

## 계획 (무엇을 왜)

- **소스 선정 (실측 완료)**: koreabaseball.com Daily.aspx 스크래핑을 정본으로 한다.
  - koreabaseball: 투수 275·타자 293명(2026), 시즌 전 경기(개막 03.28부터), 선수당 ~150ms,
    kboId = 선수 페이지 pid 와 동일, **ddlYear POST 로 과거 시즌 소급 가능**(2025 실측 67경기).
  - TheSports cache: 종료 796경기 중 players 보유 265(33%), 5월 이전 결손, ts 선수 id 라
    pid 매핑 별도 필요 → 탈락(보조 소스로도 불채택 — 결손 구간이 소급 불가).
- **저장**: `KboPlayerGameLog` 테이블 — PlayerMatchLog 패턴(멱등 id + createMany skipDuplicates,
  raw SQL 로 테이블 생성, db push 금지). 선수 중심 행(선수×경기), 투수/타자 role 구분.
- **수집**: 일일 cron(전날 종료 경기 있을 때만) — 시즌 인덱스 20 POST + 선수별 Daily ~570 GET,
  멱등 insert 라 매일 시즌 전체를 다시 훑어도 안전. 과거 시즌은 백필 스크립트(ddlYear POST).
- **표면**: /players/[pid]?league=KBO 경기 탭에 지난 시즌 로그 섹션(DB) 추가 — 현재 시즌은
  기존 라이브 스크래핑 유지(가장 신선), 과거 시즌만 DB.

## 체크리스트

- [x] 소스 실측 A: koreabaseball 인덱스·Daily 비용/구조 → 검증: 프로브 실행 로그
- [x] 소스 실측 B: TheSportsMatchCache KBO players 커버리지 → 검증: 265/796
- [x] 소스 실측 C: Daily.aspx ddlYear POST 과거 시즌 → 검증: 2025 67행 파싱
- [ ] prisma/sql/create-kbo-player-game-log.sql 작성 → 검증: prod 에 실행, 컬럼 확인
- [ ] schema.prisma 에 KboPlayerGameLog 모델 추가 → 검증: prisma generate 통과
- [ ] kbo-official.ts 에 시즌 지정 Daily fetcher(POST ddlYear) 추가 → 검증: 2025 샘플 파싱
- [ ] src/jobs/collect-kbo-player-logs.ts 수집 잡 → 검증: 2026 시즌 실행, 행 수 확인
- [ ] cron 라우트 + vercel.json + CRON_REGISTRY + package.json script → 검증: tsc 통과
- [ ] 과거 시즌 백필 2021~2025 → 검증: 시즌별 행 수 리포트
- [ ] 선수 페이지 경기 탭 — 지난 시즌 섹션 → 검증: 로컬 렌더 확인
- [ ] npm test + tsc → 검증: 통과
- [ ] 임시 프로브 스크립트 삭제, 커밋 분리(파이프라인 / 표면) → git push
