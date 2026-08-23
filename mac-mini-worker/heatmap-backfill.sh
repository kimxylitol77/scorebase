#!/bin/zsh
# heartbeat v2 — 성공/실패+에러를 EXIT 에서 자동 보고 (hb-lib.sh)
source "$HOME/dev/scorebase/mac-mini-worker/hb-lib.sh"
hb_trap mac-mini-heatmap-backfill /tmp/heatmap-backfill.log
# TheStatsAPI 히트맵 수집 — 빅5 순차 (매주 토 01:00 KST, launchd).
# 전 단계 멱등이라 매주 같은 명령을 돌리면 결손분만 이어서 채운다.
# 25/26 히트맵은 EPL·SERIE_A 만 제공되므로 나머지 리그는 24/25 로 받는다 (2026-08-14 실측).
#
# ⚠ 이 스크립트는 git reset 을 하지 않는다. 몇 시간짜리라 다른 봇의 reset 과 겹치면
#   워킹트리 진행분이 통째로 날아가기 때문. 대신 보존을 두 겹으로 둔다.
#   ① 실행 중 10분마다 heatmap-commit-data.sh — origin/main 위에 plumbing 커밋으로 직접 push.
#      워킹트리·로컬 HEAD 를 안 건드려 수집 프로세스와 경합하지 않는다.
#   ② 종료 후 마지막 1회 + 종료코드 판정.
#
# 2026-08-16 사고 — 예전 꼬리는 `git pull --rebase && git push` 뒤에 `git log -1` 을 그대로
#   찍어, 리베이스가 충돌로 죽어도 "✓ push 완료"로 보고했다. 마지막 커밋이 통째로 사라졌고
#   (리그1 24/25 2명 유실) 로그만 성공이었다. 이제 종료코드로 판정하고 실패면 봇이 운다.
set -e          # hb-lib 전제 — set -e 없이 쓰면 용인된 실패에 ERR 가 조기 발사된다
set -o pipefail
cd ~/dev/scorebase
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:$PATH"
if [ -f mac-mini-worker/.env ]; then set -a; . mac-mini-worker/.env; set +a; fi
# 이 맥의 IPv6 경로가 thestatsapi(Cloudflare)로 안 붙는다 — 1차 실행이 EHOSTUNREACH 로 죽었다.
export NODE_OPTIONS="--dns-result-order=ipv4first"

log() { echo "[heatmap-backfill $(date '+%F %T')] $1"; }
SAVE=mac-mini-worker/heatmap-commit-data.sh
log "▶ 시작"

# ── 중간 보존 루프 (10분 주기). 어떻게 죽든 EXIT 에서 같이 정리한다.
#    루프 안 실패는 삼킨다 — 중간 저장 한 번 걸렀다고 수집을 죽일 이유가 없다.
while true; do sleep 600; { zsh "$SAVE" 2>&1 | sed 's/^/  [중간저장] /'; } || true; done &
SAVER_PID=$!
trap 'kill $SAVER_PID 2>/dev/null || true' EXIT INT TERM

bash scripts/run-thestatsapi-pipeline.sh EPL 200 25/26 || log "EPL 실패(계속)"
bash scripts/run-thestatsapi-pipeline.sh SERIE_A 200 25/26 || log "SERIE_A 실패(계속)"
bash scripts/run-thestatsapi-pipeline.sh LALIGA 200 24/25 || log "LALIGA 실패(계속)"
bash scripts/run-thestatsapi-pipeline.sh BUNDESLIGA 200 24/25 || log "BUNDESLIGA 실패(계속)"
bash scripts/run-thestatsapi-pipeline.sh LIGUE_1 200 24/25 || log "LIGUE_1 실패(계속)"

kill $SAVER_PID 2>/dev/null || true

# ── 최종 보존 — 종료코드로 판정 (0 성공·변경없음 / 2 무결성 skip / 그 외 실패)
RC=0
zsh "$SAVE" || RC=$?
case $RC in
  0) log "✓ 최종 저장 완료" ;;
  2) log "⚠ 데이터 파일 무결성 미달 — 저장 건너뜀"; exit 1 ;;
  *) log "❌ 최종 저장 실패 (rc=$RC) — 수집분이 origin 에 없다. 재실행 필요"; exit 1 ;;
esac
log "✓ 종료"
