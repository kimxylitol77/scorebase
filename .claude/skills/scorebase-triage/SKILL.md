---
name: scorebase-triage
description: scorebase 운영 봇(mac-mini-data-sanity, mac-mini-route-guardian, mac-mini-narrator, mac-mini-endpoint-monitor, mac-mini-preview-coverage, mac-mini-api-quota, mac-mini-live-scores-watcher, mac-mini-baseball-poller, hermes-telegram-bot 등)이 보낸 알림을 사용자가 그대로 paste 했을 때, 알림 종류를 식별하고 production DB 직접 진단으로 false positive 여부를 확정한 뒤 옵션+confirm → fix → commit/push 까지 일관 워크플로우 실행. 알림 메시지에 "🚨"/"⚠"/"⏸"/"📍 무엇"/"⏰ 언제"/"💥 영향"/"🔍 원인"/"➡️ 확인"/"[긴급]" 같은 emoji + Korean label 패턴이 보이거나 "mac-mini-*", "hermes-telegram", "data-sanity", "route-guardian", "stale_live", "standings_mismatch", "score_drift", "inning_missing", "cache_db_mismatch" 같은 용어가 포함되면 반드시 이 스킬을 사용. 사용자가 알림을 보여주면서 "이거 봐줘", "확인해", "체크해", "fix 해" 같은 짧은 지시를 줄 때도 즉시 트리거.
---

# Scorebase Triage

scorebase 의 운영 봇 알림을 받았을 때, 사용자가 매번 같은 패턴(진단 → false positive 판별 → 옵션 → confirm → fix → push)을 반복하지 않게 자동화한 워크플로우. 잘못된 알림에 fix 하지 않고, 진짜 문제에는 정확한 코드 변경 + push 까지 한 번에.

## 왜 이 스킬이 필요한가

운영 봇 알림의 60~80% 가 false positive 인 패턴이 있습니다. 예:
- `stale_live` — Match.updatedAt 만 보면 골 없는 30분간 정체, 실제로는 ts cache fresh
- `standings_mismatch` — 두 source 의 1위 팀 비교 시 Team 중복 row 때문에 ourId 다르게 보임
- `score_drift` — collector 가 SCHEDULED → LIVE 갱신 안 한 일시적 lag

매번 사용자가 "DB 직접 까봐", "cache 도 같이 봐", "옵션 줘봐" 라고 지시하지 않아도, 알림 종류만 보면 어떤 검증을 해야 하는지 결정됩니다. 이 스킬은 그 결정을 자동화합니다.

## Workflow

1단계부터 6단계까지 순서대로 진행. 단계 건너뛰지 말고, 사용자 답을 기다릴 곳에서만 멈춥니다.

### 1. 알림 종류 식별

알림 메시지의 emoji + Korean label 에서 kind 를 추출합니다. 봇 코드는 `mac-mini-worker/data-sanity.js` 의 `KIND_LABEL` 을 참고:

| 알림 라벨 | kind | 진단 대상 테이블 |
|---|---|---|
| 📊 점수 표시 오류 | score_drift | Match (status=SCHEDULED + score 있음) |
| ⚾ 이닝 정보 누락 | inning_missing | TheSportsMatchCache.detailLive.score |
| 🔀 cache vs DB 불일치 | cache_db_mismatch | Match + TheSportsMatchCache 비교 |
| ⏸ 라이브 갱신 멈춤 | stale_live | Match.updatedAt + TheSportsMatchCache.updatedAt **둘 다** |
| 🏆 순위 cache stale | standings_stale | TheSportsStandingsCache + ApiFootballStandingsCache updatedAt |
| ⚠️ 순위 source 불일치 | standings_mismatch | 두 cache 의 1위 팀 비교 |

`mac-mini-route-guardian`, `mac-mini-endpoint-monitor`, `mac-mini-preview-coverage`, `mac-mini-api-quota` 등 다른 봇은 메시지 본문에서 직접 의도 파악.

알림에 ` #1282` 같은 Match.id 가 포함되면 그대로 진단의 출발점으로 사용. league + externalId 까지 있으면 정확도 더 높음.

### 2. Production DB 직접 진단

**Read-only 검증 스크립트를 `/Users/kimss/scorebase/scripts/_<목적>-tmp.mjs` 에 작성** 하고 실행. 임시 파일이라는 의미로 항상 `_` prefix + `-tmp.mjs` suffix. 끝나면 즉시 삭제 (`rm scripts/_*-tmp.mjs`).

스크립트 템플릿:

```js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  // 알림에 명시된 matchId, league, externalId 로 정확히 검증
  // 비교 대상: Match.updatedAt vs TheSportsMatchCache.updatedAt
  //           또는 Match.homeScore/awayScore vs cache.detailLive.score
  //           또는 두 standings cache 의 1위
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
```

실행: `node --env-file=.env.local scripts/_<목적>-tmp.mjs`

production 호출이 필요한 경우 (API 응답 신선도, ESPN 가용성 등):
```bash
curl -s -H "Authorization: Bearer $TOKEN" https://www.scorebase.kr/api/internal/<endpoint>
```

`INTERNAL_API_TOKEN` 은 `/Users/kimss/scorebase/.env.local` 에 있음.

### 3. False positive 판별

진단 결과를 알림과 비교. 다음 패턴들이 가장 흔한 false positive 원인입니다:

**stale_live**: Match.updatedAt 은 점수 변동시만 갱신 → ts cache 가 fresh 면 (보통 1~10분 전) 실제로는 정상. **반드시 두 시각의 max() 로 판단**. 이미 [data-sanity 로직](/Users/kimss/scorebase/src/app/api/internal/data-sanity/route.ts) 에는 보강돼 있지만 자체 검증 시에도 같은 기준.

**standings_mismatch**: 두 source 의 1위가 같은 팀이지만 우리 Team 테이블 ourId 가 다르면 false positive. 이름 normalize (FC/CF/SC prefix 제거 + 공백 제거) 후 substring 매칭. 또한 `team-id-mapping.json` 이 `ourLeague` filter 없이 lookup 해 cross-league 매핑 발생 (예: UEL 검사에서 LIGUE_1 Lyon 매핑) — 매핑된 ourLeague 가 검사 league 와 다르면 skip.

**score_drift**: 매치 시작 직후 5~10분은 collector 갱신 lag 정상. 시작 +30분 이상 지났는데 SCHEDULED 면 진짜 문제.

**stale_live (multi-매치 동시)**: EPL 시즌 마지막 라운드처럼 10경기 동시 진행 + 모두 stuck 30분+ 이면 worker 죽음이 아니라 단순히 골 정체 가능성. 다른 매치 중 update 시각 다양하면 worker 정상.

진단 후 다음 중 하나로 결론:
- **false positive** — 사용자에게 결과 표 + 원인 보고 + "넘기기 vs 검사 로직 보강" 옵션
- **진짜 문제** — 사용자에게 원인 + fix 옵션 (코드 / 데이터 / worker restart)
- **불확실** — 추가 진단 단계 제시 또는 사용자 확인

### 4. 옵션 제시 + confirm

**모호하면 AskUserQuestion 으로 옵션 제시**. 추천 옵션은 첫 번째 + "— 추천" 표기. 한국어로 짧게. 옵션 3~4개.

옵션 패턴 예:
- (A) 즉시 fix + push (검증 로직 보강) — 추천
- (B) 알림만 dedup 강화 / 임계 조정
- (C) 별도 task / 메모리에 백로그

### 5. Fix → 검증 → commit/push

코드 변경이 필요하면:

1. **변경 작성** — Edit tool. 한국어 주석. 새 코드의 "왜" 를 1~3줄 주석으로 (의도 설명, what 아님). 메모리 [feedback_response_format.md](/Users/kimss/.claude/projects/-Users-kimss-------/memory/feedback_response_format.md), [feedback_workflow.md](/Users/kimss/.claude/projects/-Users-kimss-------/memory/feedback_workflow.md) 따름.

2. **검증** — 우선순위 순:
   - `cd /Users/kimss/scorebase && npx tsc --noEmit -p tsconfig.json` (필수)
   - 단위 검증 스크립트 (`scripts/_verify-*-tmp.mjs`) — 새 로직이 기존 알림 케이스를 fresh/올바르게 처리하는지 확인
   - preview 는 internal API / 시즌 종료 / production data 필요한 경우 skip 명시

3. **cleanup** — 임시 스크립트 모두 `rm scripts/_*-tmp.mjs`. 영구 스크립트(예: `scripts/dedup-teams.mjs`)는 keep.

4. **commit** — heredoc 사용, 한국어, footer 없음(이전 commit 패턴 따름):
   ```bash
   cd /Users/kimss/scorebase && git add <변경 파일> && git commit -m "$(cat <<'EOF'
   fix(<scope>): 한 줄 요약
   
   원인:
   - ...
   
   해결:
   - ...
   
   검증: ...
   EOF
   )"
   ```
   타입: `fix`/`feat`/`tune`/`chore`/`revert` 등. scope: `data-sanity`/`standings`/`scores`/`live-detail`/`collect`/`baseball` 등 commit log 참고.

5. **push** — `git push origin main`. PR 만들지 않음. main 직접 push 가 패턴.

   ⚠️ **`| tail` 같은 파이프를 붙이지 말 것** — exit code 가 tail 것이 되어 거부를 성공으로 읽는다.
   판정은 `if git push ...; then`, 끝나면 `git rev-list --count origin/main..HEAD` 가 0 인지 확인.
   거부되면 `git fetch origin main && git rebase origin/main` 후 재시도(scorebase-deploy 5단계 참조).

### 6. Follow-up 기록

이번 fix 로 다 해결 안 되거나 다음 시즌에 다시 봐야 할 작업이 있으면:

- **빠른 메모** — [project_pending.md](/Users/kimss/.claude/projects/-Users-kimss-------/memory/project_pending.md) 의 `## 🚧 다른 미완료` 섹션에 한 항목 추가. 진단 결과 요약 + 진행 시점 + 다음 행동 가이드.
- **별도 작업** — `spawn_task` 로 chip 등록. prompt 는 self-contained (이 세션 memory 없는 fresh agent 도 진행 가능하게 file path + 정책 + 검증 가이드 포함).

## 알림 종류별 진단 로직 상세

### stale_live

```js
const m = await prisma.match.findUnique({ where: { id: 매치ID } });
const c = await prisma.theSportsMatchCache.findUnique({ where: { matchId: 매치ID } });
const lastUpdate = c?.updatedAt > m.updatedAt ? c.updatedAt : m.updatedAt;
// lastUpdate 가 30분 이내면 false positive
```

추가 — 같은 리그/시각대 다른 매치들의 ts.cache.updatedAt 분포 확인. 한 매치만 stuck 이면 단일 매치 문제, 다수 stuck 이면 worker/cron 문제.

### standings_mismatch

```js
// 양쪽 source 의 1위 ourId 가 다르더라도, 우리 DB Team.name 의 normalize 후 substring 매칭 시도
// + ts-mapping.json 의 ourLeague != 검사 league 면 cross-league 잘못 매핑 (skip)
```

진짜 mismatch 확정되면 `Lightsail standings-poller` 또는 `/api/cron/standings-collect` 실패 원인 진단. seasonFor 의 league 분기 누락이 흔함.

### score_drift / cache_db_mismatch

야구 한정. cache.ft 의 인덱싱이 `[home, away]` 임을 기억 (commit 8ab6194). 메모리 [feedback_thesports_baseball_indexing.md](/Users/kimss/.claude/projects/-Users-kimss-------/memory/feedback_thesports_baseball_indexing.md) 참고. cache half=0 이면 매치 시작 직후 lag — 5분 후 재검증.

### inning_missing

야구 LIVE 인데 cache.detailLive.score 없거나 half=0. ws-subscriber MQTT 끊김 또는 ts mapping 누락 의심. `/Users/kimss/scorebase/lightsail-worker/baseball-ws-subscriber.js` log 확인 권장 (SSH 가능 시) 또는 `/api/internal/ts-baseball-mapping` endpoint 호출.

### standings_stale

`STANDINGS_TS_STALE_MS = 1.5 * 3600 * 1000`, `STANDINGS_AF_STALE_MS = 26 * 3600 * 1000`. ts 가 stale 이면 Lightsail `scorebase-standings-poller` worker, af 가 stale 이면 Vercel `/api/cron/standings-collect`. seasonFor 함수의 league 분기 누락이 가장 흔한 원인.

## 절대 하지 말 것

- **알림을 무비판 수용** — production DB 검증 없이 fix 작성하지 말 것. 60~80% 가 false positive.
- **사용자 컨펌 없이 큰 변경 push** — 단순 한 줄 주석 수정이면 진행 OK. 그러나 알림 검사 로직 / 데이터 model / cron schedule 변경은 반드시 옵션 + 추천 + confirm.
- **임시 스크립트 commit** — `_*-tmp.mjs` 는 진단 후 즉시 삭제. git status 깨끗하게 유지.
- **commit footer "Co-Authored-By" 추가** — 이전 commit 들이 footer 없음. 패턴 따름.
- **PR 생성** — main 직접 push 가 scorebase 패턴.
- **NBA Team dedup 자동 실행** — Cleveland/Detroit/Knicks 3그룹은 두 row 매치 set 거의 disjoint. 비시즌(6~10월) 에 collector 정리 후 진행. [project_pending.md](/Users/kimss/.claude/projects/-Users-kimss-------/memory/project_pending.md) 참고.

## 참고

- 봇 코드: `/Users/kimss/scorebase/mac-mini-worker/data-sanity.js` (kind 라벨/원인/액션 dict)
- 진단 endpoint: `/Users/kimss/scorebase/src/app/api/internal/data-sanity/route.ts`
- 메모리 [MEMORY.md](/Users/kimss/.claude/projects/-Users-kimss-------/memory/MEMORY.md) 의 feedback_* 들 — 과거에 잘못 진단한 패턴들이 정리되어 있음
- ROADMAP: `/Users/kimss/scorebase/ROADMAP.md`
