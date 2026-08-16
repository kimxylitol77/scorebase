---
name: scorebase-deploy
description: scorebase 코드 수정 후 검증→commit→push 까지 정형화된 마무리 워크플로우. 사용자가 "이거 배포해", "push 해", "commit 하고 올려", "fix 끝났어", "deploy", "이대로 진행해" 같은 짧은 지시를 할 때 즉시 트리거. tsc 통과 + 단위 검증 + cleanup 임시 파일 + heredoc commit (한국어, footer 없음) + git push origin main + Vercel 배포 대기 + (선택) 다음 mac-mini 봇 poll 결과 monitor 까지 한 번에. 코드 변경 후 "이거 그대로 push" 같은 짧은 요청도 반드시 이 스킬을 사용해야 누락 없이 진행됩니다.
---

# Scorebase Deploy

scorebase 코드 변경 마무리를 정형화. tsc 빠뜨림, 임시 스크립트 commit, footer 자동 추가 같은 실수를 방지하고, Vercel 배포 + 봇 다음 poll 확인까지 자동.

## 왜 이 스킬이 필요한가

매번 같은 5~6 step 을 손으로 하면 누락 생깁니다:
- tsc 안 돌리고 push → Vercel build fail
- `scripts/_*-tmp.mjs` 같이 commit → 저장소 오염
- commit footer `Co-Authored-By` 자동 추가 → 이전 commit 패턴과 불일치 (사용자 명시)
- main 직접 push 가 패턴인데 PR 만들기
- push 후 production 검증 안 함 → 다음 봇 알림으로 발견

## When to trigger

- 사용자가 "push 해", "올려", "deploy", "fix 끝났어", "이대로 진행", "commit 하고 push" 같은 짧은 지시
- 코드 수정 후 사용자가 "응", "ㅇㅇ", "ㄱㄱ" 같이 confirm만 했을 때 (직전 메시지에 deploy 의도 명시되어 있으면)
- AskUserQuestion 의 "(A) 즉시 fix + push" 류 선택 후

## Workflow

순서대로 진행. 한 step 실패하면 fix 후 그 step 부터 재시작.

### 1. Pre-flight: git status + 변경 파일 식별

```bash
cd /Users/kimss/scorebase && git status
```

변경 파일 중 commit 대상 분리:
- ✅ commit 대상: src/, prisma/, scripts/dedup-teams.mjs 같은 영구 스크립트, .json mapping, 봇 코드
- ❌ 제외: `scripts/_*-tmp.mjs` 임시 진단 스크립트, .env.local, .next/, node_modules/

임시 스크립트 있으면 commit 전에 cleanup:
```bash
cd /Users/kimss/scorebase && rm scripts/_*-tmp.mjs
```

### 2. Type check (필수)

```bash
cd /Users/kimss/scorebase && npx tsc --noEmit -p tsconfig.json 2>&1 | head -20
```

error 있으면 **즉시 멈춤** + 사용자에게 보고. fix 후 재실행.

### 3. 단위 검증 (선택)

코드 로직이 데이터에 의존하면 (`data-sanity` 검사 로직 / `getStandingsPositions` 변경 등) production DB 직접 호출로 검증. `scripts/_verify-*-tmp.mjs` 패턴.

이번 세션 예시:
- `stale_live` 보강: 4건 stuck 매치가 새 로직에서 fresh 판정 되는지
- standings swap: EPL 20/20 매핑 되는지
- ts incidents 변환: 10 EPL 매치 cache last_score == DB score 정합

검증 통과하면 cleanup, 실패면 fix 후 재실행.

### 4. Commit

**heredoc 사용, 한국어, footer 없음** (이전 commit 패턴):

```bash
cd /Users/kimss/scorebase && git add <변경 파일 명시 — 절대 -A 또는 -. 쓰지 말 것> && git commit -m "$(cat <<'EOF'
fix(<scope>): 한 줄 요약 (50자 내)

원인:
- ...

해결:
- ...

검증: tsc 통과 + 단위 검증 결과 요약
EOF
)" 2>&1 | tail -10
```

**타입**: `fix` (버그) / `feat` (신규 기능) / `tune` (수치 조정) / `chore` (정리) / `revert` (되돌림) / `refactor`. `git log --oneline -10` 으로 최근 패턴 참조.

**scope**: `data-sanity` / `standings` / `scores` / `live-detail` / `collect` / `baseball` / `monitoring` / `cron` / `predictions` / `live-scores` 등. 최근 commit log 에서 자주 쓰는 것 그대로.

**본문 구조**: 원인 → 해결 → 검증 3섹션. 한국어. why 위주, what 은 짧게.

**절대 추가 X**: `Co-Authored-By` footer, `🤖 Generated with Claude Code` 같은 marker. 이전 commit 들 다 footer 없음.

### 5. Push

```bash
cd /Users/kimss/scorebase && git push origin main 2>&1 | tail -5
```

**main 직접 push 가 패턴**. PR 만들지 말 것. `gh pr create` 호출 X.

### 6. Production 검증 (선택)

Vercel 자동 배포는 보통 1~3분. 사용자가 "확인까지 해줘" 명시했거나 critical fix 면:

- 영향 받는 production URL 사용자에게 제시
  - `/scores` 매치 카드 변경 → `https://www.scorebase.kr/scores`
  - data-sanity 로직 변경 → 다음 mac-mini 봇 poll (3분 주기) 결과
  - standings 변경 → `/standings/<LEAGUE>`
- 다음 mac-mini 봇 poll 결과 monitor (3분 sleep 후 production `/api/internal/data-sanity` 호출):
  ```bash
  sleep 200 && curl -s -H "Authorization: Bearer $TOKEN" "https://www.scorebase.kr/api/internal/data-sanity" | python3 -c "import sys, json; d=json.load(sys.stdin); print(f'issues: {d[\"totals\"][\"issues\"]}')"
  ```
  단 `INTERNAL_API_TOKEN` 은 `/Users/kimss/scorebase/.env.local` 에 있음.

### 7. 결과 보고

표 형식. 한국어. commit SHA + production URL + 다음 단계 follow-up (있으면).

예:
```
[<sha>](https://github.com/kimxylitol77/scorebase/commit/<sha>) 배포 완료.

| 변경 | 효과 | Commit |
|---|---|---|
| ... | ... | ... |

다음 mac-mini-data-sanity poll(3분 주기) 부터 ... 알림 0건으로.
```

## 절대 하지 말 것

- **tsc skip** — error 무시하고 push 시 Vercel build fail.
- **`git add -A` 또는 `git add .`** — 임시 파일/secret 우발 commit 위험. 변경 파일 명시.
- **commit footer 추가** — 이번 사용자의 이전 commit 패턴 (db74c91, 091c42d, 49d7ada, d4fd56c 등) 모두 footer 없음.
- **PR 생성** — `gh pr create` 절대 호출 X. main 직접 push.
- **`--amend`** — 이미 push 된 commit 수정 위험. 새 commit 만들기.
- **hooks skip** (`--no-verify`) — pre-commit hook fail 하면 원인 찾아서 fix.
- **임시 스크립트 commit** — `scripts/_*-tmp.mjs` 는 commit 전 cleanup.

## 일반적인 trap

- **tsc 가 통과해도 단위 검증 fail** 케이스: standings-helper.ts 변경 후 EPL 매칭 0/20 같은 경우. 데이터 의존 코드는 단위 검증 필수.
- **stuck Vercel 배포**: 5분+ build 안 끝나면 vercel.com/dashboard 확인 사용자에게 안내.
- **commit message 가 너무 길어 첫 줄 50자 넘음**: github commit list 에서 잘림. 첫 줄은 짧게, 본문에서 자세히.
- **scope 모호 (`fix: 어쩌고`)**: commit log 가독성 떨어짐. 항상 `fix(scope):` 형식.

## 참고

- 최근 commit 스타일: `cd /Users/kimss/scorebase && git log --oneline -20`
- 진단 endpoint: `/api/internal/data-sanity`, `/api/internal/missing-previews`, `/api/internal/health-finding` 등
- 메모리 [feedback_workflow.md](/Users/kimss/.claude/projects/-Users-kimss-------/memory/feedback_workflow.md) — 큰 변경 한 번에 push 패턴
- 메모리 [feedback_response_format.md](/Users/kimss/.claude/projects/-Users-kimss-------/memory/feedback_response_format.md) — 결과 보고 형식
