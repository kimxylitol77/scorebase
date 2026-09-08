#!/bin/zsh
# heartbeat v2 — 성공/실패+에러를 EXIT 에서 자동 보고 (hb-lib.sh)
source "$HOME/dev/scorebase/mac-mini-worker/hb-lib.sh"
hb_trap mac-mini-daily-kleague-tactical "$HOME/dev/scorebase/logs/daily-kleague-tactical.log"
# 매일 11:00 KST — K리그1 전날 종료 경기 전술 리뷰(TACTICAL) 자동 생성·발행 ("K리그 이주의 전술 분석").
# 라운드가 금~일(가끔 수) 로 흩어져 매일 돌며 3일 lookback, 이미 글 있는 경기는 스킵 → 라운드 직후 다음 날 오전 발행.
# 팩트 게이트 탈락분은 DRAFT 로 남는다(로그에 사유). Vercel /api/cron/tactical 과 달리 빅5 는 건드리지 않는다.
set -e
set -o pipefail
cd ~/dev/scorebase
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:$PATH"

log() { echo "[kleague-tactical $(date '+%F %T')] $1"; }
log "▶ 시작"

# repo 최신화 — 잡 코드 최신 기준
git fetch origin main -q && git reset --hard origin/main -q

npx tsx --env-file=.env.local src/jobs/generate-tactical.ts --league=K_LEAGUE_1 2>&1 | tail -20

log "✓ 종료"
