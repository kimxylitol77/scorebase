#!/bin/zsh
# heartbeat v2 — 성공/실패+에러를 EXIT 에서 자동 보고 (hb-lib.sh)
source "$HOME/dev/scorebase/mac-mini-worker/hb-lib.sh"
hb_trap mac-mini-daily-fa-cup /tmp/daily-fa-cup.log
# 매일 09:40 KST — FA컵(예선 포함) TheSports 수집. 프록시 경유라 화이트리스트 무관.
# 예선 비리그 팀은 워커 push 경로가 팀을 안 만들어 전량 skip — 팀 자동 생성하는 이 잡이 정본.
# past 3 = 어제 밤(KST 새벽) 종료 매치 스코어 보정 / future 14 = 다음 라운드 추첨 반영.
set -e
set -o pipefail
cd ~/dev/scorebase
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:$PATH"

log() { echo "[fa-cup $(date '+%F %T')] $1"; }
log "▶ 시작"

# repo 최신화 — 잡 코드 최신 기준
git fetch origin main -q && git reset --hard origin/main -q

npx tsx --env-file=.env.local src/jobs/collect-fa-cup.ts --past 3 --future 14 2>&1 | tail -6
# 코파 델 레이 — 같은 구조(초반 라운드가 하부리그 팀, 워커 push 로는 전량 skip). 2026-09-24 추가.
npx tsx --env-file=.env.local src/jobs/collect-fa-cup.ts --league COPA_DEL_REY --past 3 --future 14 2>&1 | tail -6
# ts 리그 시즌 전체 일정 — 워커 diary 는 7일 앞까지만 봐서 A매치 휴식기에 "다가오는 경기 0" 이 됐다(2026-09-25).
# 새로 나온 일정·킥오프 변경만 보낸다(리그당 ts 1콜). 맨 뒤에 둬 컵 수집이 먼저 끝나게 한다.
npx tsx --env-file=.env.local src/jobs/sync-season-fixtures.ts 2>&1 | tail -4

log "✓ 종료"
