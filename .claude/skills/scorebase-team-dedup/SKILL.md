---
name: scorebase-team-dedup
description: scorebase 의 Team 테이블 중복 row 제거. 사용자가 "Team dedup", "팀 중복 정리", "LALIGA/J1/NBA Team 합쳐", "리그 X 의 중복 팀 row 정리" 같은 요청을 하거나, `standings_mismatch` 알림이 같은 1위 팀(이름 같지만 ourId 다름)으로 반복 발생할 때, 또는 새 source 추가 후 같은 팀이 두 row 로 생겼을 때 반드시 사용. 안전한 Phase 분류(Match 0 → 안전 삭제, FK 이전, 사용자 confirm 필요) → dry-run → confirm → trans 적용 → ts mapping JSON 동기 갱신 까지 한 번에. NBA 처럼 같은 source 안에서 한 팀이 두 row 인데 매치 set 이 disjoint 한 케이스는 자동 dedup 거부하고 사용자에게 경고.
---

# Scorebase Team Dedup

Team 테이블의 같은 팀 중복 row 제거. 두 source(TheSports + api-football) 가 같은 팀을 각자 ext id 로 들여놓는 경우, 또는 한 source 안에서 collector lookup 일관성이 깨져 같은 팀이 두 row 로 갈리는 경우, 안전하게 통합합니다.

## 왜 이 스킬이 필요한가

Team 중복은 사용자에게 보이지 않는 silent bug 입니다:
- `standings_mismatch` 알림이 false positive 로 반복 발생 (두 source 1위 ourId 가 다름)
- `getStandingsPositions` 의 ts/af fallback 매핑이 일관성 깨짐
- 매핑 dictionary 가 무한히 커짐

자동 dedup 은 데이터 손상 위험도 큽니다 (NBA Cleveland 처럼 두 row 매치 set 거의 disjoint → FK 합치면 200경기 한 row 가 됨, 일부는 같은 게임 중복). Phase 분류 + 사용자 confirm 필수.

## When to trigger

- 사용자가 "Team dedup", "팀 중복 정리", "같은 팀 row 합쳐" 같은 직접 요청
- `standings_mismatch` 알림이 두 source 모두 같은 팀이라고 동의하는데 ourId 다른 경우 (이번 세션 LALIGA Barcelona 4 row, J1 Kashima 2 row 케이스)
- 새 데이터 source 추가 후 같은 팀이 추가 row 로 생긴 확인 후
- [project_pending.md](/Users/kimss/.claude/projects/-Users-kimss-------/memory/project_pending.md) 의 "NBA Team row 잉여 3쌍 dedup" 같은 백로그 작업 시작

## Workflow

### 1. 영향도 분석 (read-only)

`/Users/kimss/scorebase/scripts/_team-dedup-analyze-tmp.mjs` 에 작성. 끝나면 삭제.

```js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

function normalizeTeamName(s) {
  return s.toLowerCase()
    .replace(/\b(fc|cf|ac|afc|sc|cd|rcd|sv|ss|ssc|nk|hsv|fk|club|de|el)\b/g, "")
    .replace(/[^a-z0-9가-힣]/g, "");
}

async function main() {
  const teams = await prisma.team.findMany({
    where: { league: { in: TARGET_LEAGUES } },
    select: { id: true, league: true, name: true, externalId: true },
  });
  // 1) 리그별 row count
  // 2) normalize name 으로 그룹화 → 중복 그룹 추출
  // 3) 각 그룹 row 의 Match 참조 수 (homeTeamId + awayTeamId)
  // 4) Phase 분류 (아래 참조)
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
```

### 2. Phase 분류

각 중복 그룹을 4가지 Phase 중 하나로:

| Phase | 조건 | 처리 |
|---|---|---|
| **1. 안전 삭제** | 그룹 내 1개만 Match 참조 있음 + 나머지 모두 0 | Match 참조 0인 row 그대로 DELETE |
| **2. FK 이전 후 삭제** | 매치 수 차이 큼 (10:1 같은) — 적은 row 가 isolated 데이터 | 적은 row 의 Match FK 를 canonical 로 update 후 DELETE |
| **3. 사용자 confirm 필요** | 양쪽 row 활발 (NBA Cleveland 99:101 매치) — 매치 set 이 disjoint 가능성 | **자동 진행 X**. 사용자에게 위험 보고 후 별도 분석 |
| **제외** | normalize 가 false match (예: "FC Schaffhausen" vs "SV Schaffhausen") 또는 의도된 placeholder (NBA TBD ext=-1, -2) | 처리 안 함 |

**Phase 3 케이스 판정 추가 검증** — 두 row 의 매치 set 비교:

```js
// (startTime 같은 날 + 상대팀 normalize 일치) 로 매칭 시도
function mkey(m, ownerId) {
  const day = m.startTime.toISOString().slice(0, 10);
  const opp = m.homeTeamId === ownerId ? m.awayTeam.name : m.homeTeam.name;
  return `${day}|${normalize(opp)}`;
}
// 공통이 10% 미만이면 disjoint → 자동 dedup 거부
```

NBA Cleveland 같은 경우 공통 2/100 → disjoke → 거부 + 사용자에게 collector 정리 후 진행하라고 안내 ([project_pending.md](/Users/kimss/.claude/projects/-Users-kimss-------/memory/project_pending.md) 참고).

### 3. dry-run 영향 보고

표 형식 보고. 한국어. 사용자가 phase 별 진행 결정.

예 (이번 세션 LALIGA + J1):
```
| Phase | 대상 | 작업 | Risk |
|---|---|---|---|
| 1. 자동 안전 삭제 | LALIGA 30 row + J1 14 row | DELETE만 | 없음 |
| 2. FK 이전 후 삭제 | J1 Tokyo 1매치 + Mito 1매치 | UPDATE + DELETE | 낮음 |
| 3. 사용자 confirm 필요 | NBA Cleveland/Detroit/Knicks | 매치 disjoint 확정 | 중간 — 같은 경기 중복 가능 |
| 4. 매핑 갱신 | ts team-id-mapping.json 16 entries | JSON update | 낮음 |
```

### 4. AskUserQuestion 으로 confirm

옵션:
- (A) Phase 1+2+4 진행 (Phase 3 는 별도) — 추천
- (B) Phase 3 도 동시 진행 (위험 감수)
- (C) dry-run 결과만 보고 결정

### 5. apply

기존 영구 스크립트 활용 가능: [scripts/dedup-teams.mjs](/Users/kimss/scorebase/scripts/dedup-teams.mjs) (이번 세션 LALIGA+J1 용). TARGET_LEAGUES 수정 후:

```bash
cd /Users/kimss/scorebase && node --env-file=.env.local scripts/dedup-teams.mjs           # dry-run
cd /Users/kimss/scorebase && node --env-file=.env.local scripts/dedup-teams.mjs --apply   # 실행
```

스크립트는 `prisma.$transaction` 으로 묶어 fail 시 자동 rollback. 60초 timeout.

**처리 순서** (트랜잭션 안):
1. canonical = 매치 많은 row (tie 면 id 작은 쪽)
2. 비-canonical row 의 Match.homeTeamId/awayTeamId 를 canonical 로 update
3. 비-canonical Team row delete
4. ts team-id-mapping.json 의 ourId 가 deleted row 가리키면 canonical 로 교체 (JSON write)

### 6. 검증

```bash
# dedup 후 row count + 잔여 중복 확인
node --env-file=.env.local scripts/_verify-dedup-tmp.mjs
```

각 TARGET_LEAGUES 의 잔여 중복 0 인지. 끝나면 cleanup.

### 7. Commit + push

[/scorebase-deploy](/Users/kimss/.claude/skills/scorebase-deploy/SKILL.md) 패턴 따름. commit 메시지에 dedup 통계 포함:
- 리그별 row 변화 (before → after)
- Phase 별 처리 row 수
- ts mapping 갱신 entries 수

## 절대 하지 말 것

- **자동 Phase 3 진행** — 매치 set disjoint 면 같은 경기 중복 가능성. 반드시 사용자 confirm.
- **컵 리그 (UCL/UEL/UECL 등) row 를 정규 리그 row 와 합치기** — 의도된 별도 row 구조. UEL Lyon row 와 LIGUE_1 Lyon row 는 다른 league 라 dedup 대상 아님.
- **NBA 의 자동 dedup** — 같은 source 안에서 collector lookup 일관성 깨진 케이스. 비시즌(6~10월) 에 collector 정리 후 진행. [project_pending.md](/Users/kimss/.claude/projects/-Users-kimss-------/memory/project_pending.md) 참고.
- **SUI_CUP false positive 처리** — "FC Schaffhausen" vs "SV Schaffhausen" 은 진짜 다른 팀. normalize 가 FC/SV 둘 다 제거해서 false match.
- **TBD placeholder dedup** — NBA TBD (ext=-1, -2) 같은 의도된 placeholder pair 는 제외.

## 일반적인 trap

- **Match.homeTeamId / awayTeamId 가 unique 제약 위반**: 다행히 Match 에 unique 제약 (homeTeamId, awayTeamId, startTime) 없음. 트랜잭션 안에서 update 안전.
- **ts mapping JSON 동시 수정 충돌**: trans 안에서 JSON write 안 됨. trans 끝난 직후 별도로 fs.writeFileSync.
- **`@@unique([league, externalId])` 위반**: 같은 (league, ext) 두 row 가 없으므로 dedup 후에도 OK.
- **player photo URL / 다른 team-keyed 데이터 깨짐**: 메모리 [reference_player_photo_urls.md](/Users/kimss/.claude/projects/-Users-kimss-------/memory/reference_player_photo_urls.md) 참고 — 14개 리그 photo source 가 Team.externalId 기반이면 영향. dedup 전 확인.

## 참고

- 영구 스크립트: [scripts/dedup-teams.mjs](/Users/kimss/scorebase/scripts/dedup-teams.mjs) (LALIGA + J1 dedup 완료, TARGET_LEAGUES 수정으로 확장)
- ts mapping: `src/lib/sports/thesports/team-id-mapping.json` (973 entries)
- 이번 세션 결과 (2026-05-25):
  - LALIGA: 56 → 26 (30 row 삭제, 다 Match 0)
  - J1_LEAGUE: 40 → 24 (16 row 삭제, 2 매치 FK 이전)
  - NBA 3그룹: 매치 set disjoint 라 비시즌 미루기
  - SUI_CUP 1그룹: false positive 제외
