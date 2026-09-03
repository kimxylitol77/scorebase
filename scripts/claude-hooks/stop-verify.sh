#!/usr/bin/env bash
# Claude 턴 종료 게이트 — 코드가 바뀐 채 턴을 끝내려 하면 tsc·테스트를 돌리고, 실패하면 종료를 막아 고치게 한다
set -u
input=$(cat)
cwd=$(echo "$input" | jq -r '.cwd // empty')
session=$(echo "$input" | jq -r '.session_id // "nosession"')
cd "${cwd:-/Users/kimss/scorebase}" 2>/dev/null || exit 0
git rev-parse --show-toplevel >/dev/null 2>&1 || exit 0
cd "$(git rev-parse --show-toplevel)"
[ -x node_modules/.bin/tsc ] || exit 0

# 바뀐 코드 파일만 본다 (src·scripts 의 ts, _ 접두 scratch 제외)
changed=$(git status --porcelain --untracked-files=all -- src scripts 2>/dev/null \
  | awk '{print $NF}' | grep -E '\.(ts|tsx|mts)$' | grep -vE '(^|/)_' || true)
[ -z "$changed" ] && exit 0

common=$(git rev-parse --git-common-dir)
stamp="$common/stop-verify-ok"
counter="$common/stop-verify-count-$session"

# 같은 변경 내용을 이미 통과시켰으면 다시 돌리지 않는다
sig=$( { git diff HEAD -- src scripts; echo "$changed" | while read -r f; do [ -f "$f" ] && cat "$f"; done; } | shasum | cut -d' ' -f1)
if [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$sig" ]; then
  rm -f "$counter"
  exit 0
fi

# 같은 세션에서 3번 막았는데도 못 고치면 무한 반복 대신 통과시키고 사용자에게 맡긴다
count=$(cat "$counter" 2>/dev/null || echo 0)
if [ "$count" -ge 3 ]; then
  rm -f "$counter"
  echo "[stop-verify] 3회 연속 검증 실패 — 자동 차단을 멈춥니다. 사용자가 직접 확인하세요." >&2
  exit 0
fi

out=$(npm run -s typecheck 2>&1); code=$?
if [ "$code" -eq 0 ]; then out=$(npm test -s 2>&1); code=$?; fi
if [ "$code" -eq 0 ]; then
  echo "$sig" > "$stamp"
  rm -f "$counter"
  exit 0
fi

echo $((count + 1)) > "$counter"
detail=$(echo "$out" | grep -vE '^✔' | tail -40)
jq -n --arg r "코드 변경이 있는데 tsc 또는 단위 테스트가 실패했습니다. 통과하기 전에는 작업을 끝낼 수 없습니다. 테스트를 고치거나 지우거나 skip 하지 말고 코드를 고치세요. 검증 출력 (마지막 40줄):
$detail" '{decision:"block", reason:$r}'
exit 0
