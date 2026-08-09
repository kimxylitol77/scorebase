# 위키형 데이터 축적 — 1단계 (시즌 순위 영구 아카이브) 체크리스트

> 목표. 순위 캐시 3종(ts·af·농구)이 리그당 1행이라 시즌 롤오버 때 최종 순위가 소멸하는 것을 막는다.
> 배경·결정 근거는 context-notes.md 참조.

## A. 스키마

- [x] `SeasonStandingsArchive` 모델 추가 (schema.prisma) — unique (league, seasonLabel), rows Json 비정규화
- [x] `prisma/sql/create-season-standings-archive.sql` 작성 (raw SQL — db push 금지 패턴, lock_timeout 3s)
- [x] prod 적용 (`prisma db execute`) + `prisma generate`

## B. 일일 아카이버 잡

- [x] `src/jobs/archive-standings.ts` — (league, 현재 시즌 라벨) upsert
  - [x] 축구: `getFullStandings()` 전 리그 순회 (시즌 게이트 내장)
  - [x] KBO·NPB: `fetchBaseballTable()`
  - [x] MLB: ApiFootballStandingsCache(baseball-standings cron 산출) + Team.externalId join
  - [x] NHL: `fetchNhlStandings()` — 라벨은 응답의 seasonId 사용 (오프시즌 오라벨 방지)
  - [x] NBA: `fetchBasketballStandings()` — 시즌 판별 불가 시 skip
  - [x] 개막 전 placeholder 가드: 전 행 played 합 0 이면 skip
  - [x] 퇴행 가드: 기존 행 played 합 > 신규 played 합이면 덮어쓰지 않음
- [x] 팀 비정규화: name(en)·한글명·로고를 아카이브 시점에 굳힘

## C. 배선

- [x] `/api/cron/archive-standings` 라우트 (cron-auth + recordCronRun)
- [x] vercel.json 크론 등록 (일 1회)
- [x] CRON_REGISTRY 등록 (dead-man's switch)
- [x] package.json `job:archive-standings`

## D. 25-26 축구 백필 (소멸 위험 — 이번 세션 내 실행)

- [x] `scripts/backfill-standings-archive.ts` — af /standings?season=2025 직접 호출
  - [x] 대상: API_FOOTBALL_LEAGUE_ID 전 리그 (NO_STANDINGS 제외)
  - [x] 팀 매칭: Team.externalId → 이름 정규화 매칭 → 실패 시 teamId null (name/logo 는 af 응답 보존)
  - [x] 이미 아카이브된 (league, label) 은 skip (멱등)
- [x] 실행 + 리그별 성공/실패 집계

## E. 검증

- [x] `npx tsc --noEmit`
- [x] 아카이버 로컬 1회 실행 → 리그 수·행 수 집계
- [x] 백필 스팟체크: EPL·라리가 25-26 1위가 league-champions.json 우승팀과 일치
- [x] 배포 (scorebase-deploy 절차)

## 이번 범위 밖 (2·3단계로)

- 열람 페이지 (리그 히스토리 시즌 선택·팀 시즌별 성적 탭·H2H) — 2단계
- NBA 25-26 과거 백필 (ESPN 과거 순위 미제공), 야구 과거 시즌, 농구·하키 선수 로그 — 3단계
- team-history.json 20팀 → 확장 — 별도 작업
