---
name: scorebase-coverage-audit
description: scorebase 의 축구 리그 standings/매핑/cache freshness 를 한 번에 점검하고 분류 표로 출력. 사용자가 "리그 순위 체크", "/scores 리그 cover 확인", "standings 누락 체크", "리그 전부 적용된 건지", "축구 리그 audit", "EPL/LALIGA/BUNDESLIGA 순위 상태" 같은 요청을 하거나, 시즌 시작/종료 시점에 일괄 점검이 필요할 때, 또는 새 리그 추가 후 cover 가 잘 됐는지 검증할 때 반드시 사용. /scores 매치 카드의 [순위] 표시 정합성 + ts mapping 누락 + af cache stale 을 한꺼번에 본다.
---

# Scorebase Coverage Audit

scorebase 의 /scores 페이지에 표시되는 축구 매치 [순위] 의 정확성을 보장하기 위한 일괄 점검 스킬. 매번 사용자가 "어느 리그가 빠졌지?" "왜 EPL 순위가 틀리지?" 라고 묻지 않게, 한 번에 모든 리그의 standings 상태를 매트릭스 표로 출력합니다.

## 왜 이 스킬이 필요한가

축구 standings 표시는 4가지 source 가 얽혀있습니다:
1. `TheSportsStandingsCache` (Lightsail standings-poller 1시간 주기)
2. `ApiFootballStandingsCache` (Vercel `/api/cron/standings-collect` 1일 주기)
3. `src/lib/sports/thesports/team-id-mapping.json` (ts team_id → ourId)
4. `src/lib/sports/thesports/league-id-mapping.json` (ts league_id + season_id)

한 곳이라도 비면 매치 카드 [순위] 가 사라지거나 잘못 표시됩니다. 새 리그 추가, 시즌 표기 변경, ESPN/TheSports API 변동 등으로 자주 깨지는 영역이라 주기적 audit 필요.

## When to trigger

- 사용자가 "축구 리그 순위 체크", "/scores cover 확인", "리그 전부 적용된 건지" 같은 요청
- 시즌 시작 1~2주 전 (cover 누락 미리 발견)
- 시즌 종료 직후 (다음 시즌 표기 대비)
- 새 리그 추가 후 (commit 직후 audit)
- `standings_stale` 알림 다수 발생 시
- `getStandingsPositions` / `getFullStandings` 로직 변경 후 회귀 검증

## Workflow

### 1. /scores 윈도우 활성 리그 추출

매치가 있는 리그만 audit (정상 시점에 없는 리그까지 보면 시간 낭비). 윈도우는 [c129eca commit](/Users/kimss/scorebase/src/app/scores/page.tsx) 기준 -1h ~ +25h.

### 2. 진단 스크립트 작성 + 실행

`/Users/kimss/scorebase/scripts/_coverage-audit-tmp.mjs` 에 작성. SOCCER_LEAGUES list 는 `src/lib/sports/types.ts` 참고. 끝나면 즉시 삭제.

```js
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
const prisma = new PrismaClient();

const mapping = JSON.parse(fs.readFileSync('src/lib/sports/thesports/team-id-mapping.json', 'utf-8'));
const TS_BY_LG = new Map();
for (const e of mapping) {
  if (!TS_BY_LG.has(e.ourLeague)) TS_BY_LG.set(e.ourLeague, new Map());
  TS_BY_LG.get(e.ourLeague).set(e.tsId, e.ourId);
}

async function main() {
  const now = new Date();
  const from = new Date(now.getTime() - 1 * 3600 * 1000);
  const to = new Date(now.getTime() + 25 * 3600 * 1000);

  // 1) 윈도우 매치 있는 리그 + 매치 수
  const matches = await prisma.match.findMany({
    where: { league: { in: [...SOCCER_LEAGUES] }, startTime: { gte: from, lte: to } },
    select: { league: true },
  });
  const matchByLg = new Map();
  for (const m of matches) matchByLg.set(m.league, (matchByLg.get(m.league) ?? 0) + 1);

  // 2) standings cache 일괄 조회
  const tsAll = await prisma.theSportsStandingsCache.findMany();
  const afAll = await prisma.apiFootballStandingsCache.findMany();
  const tsByLg = new Map(tsAll.map(s => [s.league, s]));
  const afByLg = new Map(afAll.map(s => [s.league, s]));

  // 3) 리그별로 새 getStandingsPositions 로직 simulate (TheSports 우선 + af fallback)
  // 4) 표 출력: 매치 수 / 매핑 비율 / ts age / af age
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

### 3. 분류 + 표 출력

5개 카테고리:

| 분류 | 조건 | 의미 |
|---|---|---|
| ✅ 정상 | 양쪽 source 있음 + 매핑 ≥ 50% | 사용자 화면 정상 |
| ⚠ ts mapping 누락 | af 단독 의존 (ts mapping entry 없음) | EPL 케이스처럼 ext id 시리즈 불일치 위험 |
| ⚠ af cache stale | af updatedAt 26h+ | `standings-collect` cron fail 누적 — seasonFor 분기 누락 흔함 |
| ⚠ ts cache stale | ts updatedAt 1.5h+ | Lightsail `scorebase-standings-poller` worker 죽음 의심 |
| ❌ NONE | 양쪽 cache 모두 없음 | API_FOOTBALL_LEAGUE_ID + ts league_id 미등록 또는 fetch fail |

**컵/토너먼트 (순위 없는 게 정상)**: UCL/UEL/UECL/UEFA_WCL/WORLD_CUP/CLUB_WORLD_CUP/INTL_FRIENDLY/SUI_CUP/KFA_CUP/AFC_CL/AFC_CL_TWO/AFC_U23/COPA_LIB/COPA_SUD/CONCACAF_CCUP/CHAMPIONS_TROPHY 는 별도 섹션에 표시. ❌ NONE 으로 잡지 말 것.

### 4. 보고 형식

표로 사용자에게. 각 분류별 리그 수 + 영향 받는 매치 수 + 한 줄 원인. 사용자 메모리 [feedback_response_format.md](/Users/kimss/.claude/projects/-Users-kimss-------/memory/feedback_response_format.md) 패턴.

예:
```
| 분류 | 리그 수 | 매치 | 시급도 |
|---|---|---|---|
| ✅ 정상 | 31 | 84 | — |
| ❌ NONE (발트 3국) | 3 | 7 | 낮음 |
| ⚠ af stale 26h+ | 7 | — | 중 |
| ⚠ ts mapping 누락 | 6 | — | 낮음 |
```

### 5. 액션 옵션 제시

발견된 문제 별로:

- **❌ NONE** → 원인 진단 (cron seasonFor 분기 / API_FOOTBALL_LEAGUE_ID / ts league-id-mapping.json 의 tsSeasonId)
- **⚠ ts mapping 누락** → ts team-id-mapping.json + league-id-mapping.json 에 entry 추가 (lightsail-worker 에서도)
- **⚠ af stale** → Vercel `/api/cron/standings-collect` 로그 확인 + seasonFor european set 에 league 추가
- **⚠ ts stale** → Lightsail SSH (가능하면) 로 `sudo systemctl status scorebase-standings-poller`

각 fix 가 minor 리그면 ROI 낮음 — 사용자에게 "지금 fix vs 백로그 ([project_pending.md](/Users/kimss/.claude/projects/-Users-kimss-------/memory/project_pending.md) 추가)" 옵션 제시.

## 절대 하지 말 것

- **모든 SOCCER_LEAGUES 일괄 audit** — 윈도우 안 활성 리그만. 활성 안 한 리그는 standings 없어도 사용자 화면에 영향 X.
- **cup 리그를 NONE 으로 분류** — 토너먼트는 standings 없는 게 정상.
- **임시 스크립트 commit** — `_coverage-audit-tmp.mjs` 는 audit 후 즉시 `rm`.
- **af-fill 0 인 리그를 무조건 ⚠ 로 분류** — TheSports 만으로 충분히 채워지면 정상.

## 참고

- `getStandingsPositions` 로직: [/Users/kimss/scorebase/src/lib/sports/thesports/standings-helper.ts:61](/Users/kimss/scorebase/src/lib/sports/thesports/standings-helper.ts:61)
- `seasonFor` league 분기: [/Users/kimss/scorebase/src/app/api/cron/standings-collect/route.ts:43](/Users/kimss/scorebase/src/app/api/cron/standings-collect/route.ts:43)
- ts mapping: `src/lib/sports/thesports/team-id-mapping.json` (team), `league-id-mapping.json` (league/season)
- API_FOOTBALL_LEAGUE_ID: `src/lib/sports/api-football-pro.ts:13`
- 이번 세션의 audit 결과 (2026-05-25): 34개 활성 리그 중 ❌3 (발트), ⚠7 (af stale), ⚠6 (ts mapping 누락), ✅24 정상
