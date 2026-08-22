#!/bin/zsh
# heartbeat v2 — 성공/실패+에러를 EXIT 에서 자동 보고 (hb-lib.sh)
source "$HOME/dev/scorebase/mac-mini-worker/hb-lib.sh"
hb_trap mac-mini-nightly-report /tmp/nightly-report.log
# 매일 — 아침 운영 브리핑 (트래픽·적중률·신규 글·봇 실패·오늘 경기 + 데이터 이상).
# 읽기전용 GET + notify POST 만. 무배포.
set -e
cd ~/dev/scorebase
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/node@22/bin:$PATH"
if [ -f mac-mini-worker/.env ]; then set -a; . mac-mini-worker/.env; set +a; fi

log() { echo "[nightly-report $(date '+%Y-%m-%d %H:%M:%S')] $1"; }
log "▶ 시작"

SITE="${SITE_URL:-https://www.scorebase.kr}" TOKEN="$INTERNAL_API_TOKEN" node ~/dev/scorebase/mac-mini-worker/morning-brief.js
log "✓ 종료"
