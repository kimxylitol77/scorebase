#!/usr/bin/env bash
# SessionStart 훅 — 압축·재개로 새로 시작한 컨텍스트에 인계 기록을 다시 주입한다.
# 진행 노트(current.md)가 있으면 항상, 압축·재개로 시작한 경우엔 직전 스냅샷도 함께 넣는다.
set -uo pipefail
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

DIR="/Users/kimss/scorebase/reports/handoff"
IN="$(cat)"
SRC="$(printf '%s' "$IN" | jq -r '.source // ""' 2>/dev/null)"

python3 - "$DIR" "$SRC" <<'PY'
import json, os, sys

d, src = sys.argv[1], (sys.argv[2] or "startup")
parts = []

cur = os.path.join(d, "current.md")
if os.path.exists(cur) and os.path.getsize(cur) > 0:
    parts.append("진행 중이던 작업 노트 (reports/handoff/current.md)\n\n" + open(cur, encoding="utf-8").read()[:6000])

snap = os.path.join(d, "latest.md")
if src in ("compact", "resume", "clear") and os.path.exists(snap) and os.path.getsize(snap) > 0:
    parts.append("직전 압축 시점 스냅샷 (reports/handoff/latest.md)\n\n" + open(snap, encoding="utf-8").read()[:4000])

if not parts:
    raise SystemExit(0)

txt = (
    f"컨텍스트가 새로 시작됐다(source={src}). 아래는 이전 세션이 디스크에 남긴 인계 기록이다.\n"
    "이어서 진행하되, 기록이 지금 코드 상태와 다를 수 있으니 파일·git 을 먼저 확인하고 믿어라.\n"
    "진행 상황이 바뀔 때마다 reports/handoff/current.md 를 갱신하고, 작업이 끝나면 그 파일을 지운다.\n\n"
    + "\n\n---\n\n".join(parts)
)
print(json.dumps({"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": txt}}, ensure_ascii=False))
PY
exit 0
