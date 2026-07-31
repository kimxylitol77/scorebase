# 축구 시즌 전환 구조 (2026-07-31)

## 왜 만들었나

TheSports 의 `season_id` 는 시즌마다 바뀐다. 이 값이 두 곳에 손으로 관리되고 있었다.

1. 저장소 `src/lib/sports/thesports/league-id-mapping.json` 의 `tsSeasonId`
2. 워커 서버(Vultr Seoul, `/home/ubuntu/scorebase-worker/src/`)에 수동 복사된 같은 파일의 사본

새 시즌이 와도 둘 다 사람이 고쳐야 했고, 못 고치면 poller 가 **지난 시즌 uuid** 로 순위표를 조회한다.
그 조회는 에러가 아니라 빈 응답으로 돌아오고, poller 는 `continue` 한다. 결과적으로 캐시가
**작년 순위표에 동결**된 채 새 시즌 경기 카드에 붙는다. 2026-07-31 실측에서 UCL·UEL·UECL·분데스리가
캐시가 1,740시간(72일) 동안 갱신되지 않은 채 화면에 나가고 있었다.

게다가 poller 에는 heartbeat 가 없어 "죽었다"와 "데이터가 좀 오래됐다"를 구분할 수 없었다.

## 구조

```
리그의 고정 정보 (거의 안 바뀜)          매년 바뀌는 시즌 정보 (정본)
league-id-mapping.json                   CompetitionSeason 테이블
  code / tsId(tournament) / 이름           league + provider + providerSeasonId
                                           seasonYear / seasonLabel / 기간
                                           status: DISCOVERED→VERIFIED→ACTIVE→ARCHIVED
```

- `tsSeasonId` 는 저장소 JSON 에 남아 있지만 **호환 경로**다. 레지스트리에 ACTIVE 가 생기면 그쪽이 이긴다.
- 같은 `league/provider` 에 ACTIVE 는 하나 — DB 부분 unique index + `activateSeason()` 트랜잭션 이중 방어.

## 데이터 흐름

```
[발견]  TheSports diary/recent list
          → collectSeasonCandidates()          (순수 함수)
          → recordDiscoveredSeason()           status=DISCOVERED

[검증]  verifySeasonCandidate()                (순수 함수)
          새 season uuid / 대회 id 일치 / 향후 경기 존재 / 참가팀 수 /
          팀 매핑률 95% / 개막일 타당성 / 순위 API (개막 전 빈 표는 정상, 친선 제외)
          → markSeasonVerified()               status=VERIFIED

[전환]  activateSeason(id, reason)             status=ACTIVE (기존 ACTIVE 는 ARCHIVED)
          ⚠ 자동 발견만으로 ACTIVE 가 되지 않는다. 전환은 명시적 단계다.

[폴링]  standings-poller (Vultr Seoul)
          → GET /api/internal/football-seasons  (ACTIVE 목록, Bearer)
          → TheSports season/recent/table/detail
          → POST /api/internal/thesports-standings
          → POST /api/internal/bot-heartbeat    (전체 결과 + 리그별 실패)

[표시]  standings-helper
          ACTIVE 시즌과 같은 시즌의 캐시만 사용 (standings-gate)
          시즌 안 맞는 af 캐시는 병합하지 않음 — 서로 다른 시즌 두 표를 절대 안 섞는다
          개막 전 = "시즌 개막 전" 상태 (지난 시즌 표로 메우지 않음)

[보강]  /api/cron/standings-collect
          ts 캐시가 없거나·ACTIVE 시즌과 어긋나거나·24h+ 갱신이 끊긴 리그만 af 로 보강
          ⚠ 매핑률 미달은 대상이 아니다 — TheSports 1순위 원칙(af 가 아니라 ts 팀매핑으로 푼다)
          + "최근/향후 일정이 있는 리그"로 한 번 더 좁혀 quota 보호 (회차당 최대 45리그)

[감시]  /api/cron/football-season-watch (6시간)
          poller heartbeat(vultr-standings-poller) · ACTIVE인데 캐시 없음 ·
          개막 14일 내 시즌 없음 · 시즌 ID 불일치 · 매핑률 미달 · 일정만 있고 순위 소스 없음
          → HealthCheck row + 상태가 바뀌었을 때만 텔레그램
```

## 운영 명령

```bash
# 진단 (운영 DB 읽기 전용, 외부 API 미호출)
npm run audit:football-seasons
npm run audit:football-seasons -- --json
npm run audit:football-seasons -- --all           # 일정 없는 리그까지
npm run audit:football-seasons -- --league EPL,UCL

# 후보 발견 (TheSports 호출 — IP whitelist 필요, 기본 dry-run)
npm run discover:football-seasons -- --league EPL
npm run discover:football-seasons -- --league EPL --write

# 검증·전환 (기본 dry-run)
npm run verify:football-season -- --league EPL
npm run verify:football-season -- --league EPL --write
npm run verify:football-season -- --league EPL --write --activate
```

`--write` 없이는 어떤 스크립트도 DB 를 건드리지 않는다. `--activate` 는 `--write` 와 함께여야 한다.

## 롤아웃 순서

1. `psql "$DATABASE_URL" -f prisma/sql/create-competition-season.sql` (신규 테이블만 생성) → `npx prisma generate`
2. 배포 — 이 시점엔 ACTIVE 행이 0개라 화면 동작은 이전과 동일하다(호환 경로)
3. Vultr 워커에 `standings-poller.js` 배포(`src/` 하위로 rsync) + `systemctl restart scorebase-standings-poller.service`
4. `npm run audit:football-seasons` 로 예외 확인
5. 리그별 `discover` → `verify --write` → 통과한 리그만 `--activate`
6. ACTIVE 가 붙은 리그부터 시즌 게이트가 실제로 동작한다

## 알려진 한계

- **팀 매핑률 95% 기준은 현재 대부분의 리그가 못 넘는다.** 2026-07-31 실측 127개 ts 캐시 중 95% 이상은 22개뿐이다.
  그래서 매핑률은 **시즌 자동 전환의 차단 조건**으로만 쓴다.
  - 화면 노출을 막는 데 쓰지 않는다 — 막았다면 지금 잘 나오는 리그 다수가 빈 표가 된다.
  - af 보강 대상 선정에도 쓰지 않는다 — TheSports 1순위 원칙상 매핑 누락은 af 가 아니라
    **ts 팀매핑 추가**로 푼다(BELARUS_PL stat-bridge 사례). 감시가 예외로 보고할 뿐이다.
- **컵·유스 대회 `code=405` 는 정상 baseline 이다.** TheSports 가 "이 대회는 순위표 미제공"이라고
  답하는 코드로, 매 회차 40여 건 나온다(Vultr 전환 검증 시 ok=86 / 405 44건). 워커는 이걸 실패가
  아니라 `empty` 로 집계한다 — 아니면 heartbeat 가 10분마다 실패 알림을 쏜다.
- **유럽 컵 stale 은 2~8월에 정상이다.** UCL/UEL/UECL 순위표는 리그페이즈(9~1월)에만 갱신된다.
  감시는 poller 가 살아있으면 컵의 `cache-stale` 을 면제한다(data-sanity 의 `cupExempt` 와 같은 규칙).
  단 **시즌 ID 불일치는 컵이라도 면제하지 않는다** — 지금 UCL 이 딱 그 경우이고 진짜 문제다.
- `BRASILEIRAO_2` 는 순위 매핑은 있는데 `SOCCER_LEAGUES` 집합에는 없다. 시즌 목록 API 는
  "축구 집합 ∪ 매핑 파일" 합집합으로 걸러 이 리그가 조용히 폴링에서 빠지지 않게 한다.
- `ASEAN_CHAMP` 는 TheSports 대회 매핑(tsId) 자체가 없어 시즌 레지스트리로 관리할 수 없다.
