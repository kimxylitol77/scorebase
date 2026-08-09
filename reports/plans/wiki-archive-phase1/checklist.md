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

---

# 2단계 — 팀 페이지 시즌 접기 (같은 페이지, 시즌 차원 추가)

> 사용자 지시(8/9). /teams/[id] 의 "시즌 통계·팀 시즌 통계·xG 추이"를 시즌 단위로 접고
> 26-27 데이터가 쌓이게. 따로 페이지를 만들지 않는다.

## A. ts 팀 시즌 통계 아카이브 (유일한 재계산 불가 소스)

- [x] `TeamSeasonStatArchive` 테이블 (teamId+seasonLabel unique, raw SQL) + prod 적용
- [x] `src/jobs/archive-team-stats.ts` — ts `/v1/football/season/recent/team/stat` 리그당 1콜, TeamSourceId 로 팀 매핑, 경기수 퇴행 가드
- [x] 기존 archive-standings cron 라우트에서 함께 실행 (cron 추가 없음)
- [x] 백필: data/team-season-stats.json (76팀, 25-26 동결분) → label 2025-26

## B. 페이지 시즌 접기

- [x] 서버: 시즌 창 슬라이스 계산 (SEASON_BOUNDARY 창 역순회, 종료 10경기 이상 시즌만, 최대 3)
- [x] 시즌별: calcStandings 순위·승점·득실·공수랭크 + xG(시즌 창 전체 평균 + 최근 10 차트) + ts 통계(아카이브)
- [x] 클라이언트 `TeamSeasonPanel` — 시즌 칩 토글, 현재 시즌 기본, 과거 시즌 접힘
- [x] 기존 세 섹션을 패널로 교체 (Elo 는 현재 시즌만 표시)
- [x] 폼·스트릭·홈원정·로스터 등 다른 섹션은 불변

## C. 검증

- [x] tsc + 테스트
- [x] 잡 실행 → 아카이브 행 확인 (K리그 등 진행 시즌)
- [x] dev 실렌더: /teams/1554 (아스널) — 25-26 접힘 + 26-27 기본
- [x] 배포

---

# 2단계 마무리 — 열람 면 3종 (2026-08-09, "전부 해줘")

- [x] 리그 "역사" 탭 시즌별 최종 순위 — LeagueHistory 에 SeasonStandingsArchive 아코디언(완료 시즌만, 우승팀 배지, 접힘). 우승 데이터 없는 리그도 아카이브만 있으면 노출되게 빈 상태 분기 조정
- [x] 선수 시즌별 기록 — PlayerMatchLog 전체(최대 500) 시즌 집계 표를 출전기록 탭 상단에 (경기·선발·골·도움·평점평균·카드, 달력형 리그는 연도 라벨·브라질 세리에A 는 국기로 구분)
- [x] H2H 페이지 — /teams/[id]/vs/[oppId] (전적 요약·비율 바·대회별 전적·다가오는 맞대결·역대 목록, canonical 은 작은 id 순서). 진입 = 팀 페이지 다가오는 경기 "상대전적" 링크
- [x] 검증: tsc 통과 · dev 실렌더 3종 확인 · 콘솔 에러 0
- 참고: npm test 3건 실패는 upstream d957798(J1/J2 그룹 세트 비움)이 테스트 미갱신 — 별도 작업 칩 발행(task_86606a0f), 이 변경과 무관
