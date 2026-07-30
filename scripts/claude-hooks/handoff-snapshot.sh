#!/usr/bin/env bash
# PreCompact 훅 — 컨텍스트 압축 직전에 이어받기용 상태를 디스크에 박아둔다.
# 압축은 대화를 요약하며 세부(브랜치·미커밋 변경·진행 노트)를 흘리므로, 결정적 상태는 파일로 남긴다.
set -uo pipefail
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

REPO="/Users/kimss/scorebase"
DIR="$REPO/reports/handoff"
mkdir -p "$DIR/snapshots" 2>/dev/null

IN="$(cat)"
SID="$(printf '%s' "$IN" | jq -r '.session_id // "unknown"' 2>/dev/null | cut -c1-8)"
TRIG="$(printf '%s' "$IN" | jq -r '.trigger // "auto"' 2>/dev/null)"
[ -n "$SID" ] || SID="unknown"
TS="$(date +%Y%m%d-%H%M%S)"
OUT="$DIR/snapshots/${TS}-${SID}.md"

{
  echo "# 인계 스냅샷 ${TS} (session ${SID}, ${TRIG} compact)"
  echo
  echo "## 진행 노트 (reports/handoff/current.md)"
  if [ -s "$DIR/current.md" ]; then
    cat "$DIR/current.md"
  else
    echo "(없음 — 이 세션이 진행 노트를 남기지 않았다)"
  fi
  echo
  echo "## git 상태 (스냅샷 시점 실측)"
  echo '```'
  echo "main repo branch: $(git -C "$REPO" branch --show-current 2>/dev/null)"
  echo "--- 미커밋 변경 (상위 40) ---"
  git -C "$REPO" status --short 2>/dev/null | head -40
  echo "--- worktree ---"
  git -C "$REPO" worktree list 2>/dev/null
  echo "--- push 대기 커밋 ---"
  git -C "$REPO" worktree list --porcelain 2>/dev/null | awk '/^worktree /{print $2}' | while read -r w; do
    n="$(git -C "$w" log --oneline origin/main..HEAD 2>/dev/null | wc -l | tr -d ' ')"
    [ "${n:-0}" = "0" ] || echo "$w: ${n}건"
  done
  echo "--- 최근 커밋 ---"
  git -C "$REPO" log --oneline -5 2>/dev/null
  echo '```'
} > "$OUT" 2>/dev/null

# latest.md 는 항상 최신 스냅샷을 가리킨다 (SessionStart 훅이 이걸 읽는다)
cp -f "$OUT" "$DIR/latest.md" 2>/dev/null

# 보관 30개 — 압축마다 한 개씩 쌓이므로 오래된 것은 버린다
ls -1t "$DIR/snapshots" 2>/dev/null | tail -n +31 | while read -r old; do
  rm -f "$DIR/snapshots/$old" 2>/dev/null
done

printf '{"systemMessage":"인계 스냅샷 저장: %s"}\n' "reports/handoff/snapshots/${TS}-${SID}.md"
exit 0
