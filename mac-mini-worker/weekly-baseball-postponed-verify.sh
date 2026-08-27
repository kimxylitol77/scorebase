#!/bin/zsh
# heartbeat v2 — 성공/실패+에러를 EXIT 에서 자동 보고 (hb-lib.sh)
# 주간 잡은 로그가 사라지면 다음 기회가 일주일 뒤다 — /tmp 는 재부팅·주기청소로 지워져
# 2026-08-23 실패를 사후에 못 봤다. repo 안 logs/ 로 (.gitignore *.log).
mkdir -p "$HOME/dev/scorebase/logs"
source "$HOME/dev/scorebase/mac-mini-worker/hb-lib.sh"
hb_trap mac-mini-weekly-baseball-verify $HOME/dev/scorebase/logs/weekly-baseball-postponed-verify.log
# 매주 월 08:30 KST — 야구 미래 POSTPONED 오분류를 TheSports 교차 대조로 정정.
#
# Vercel 데일리 cron(verify-baseball-postponed)은 api-baseball 한 소스만 보고 게이트가
# "소스 현재 status=NS" 라, 소스가 계속 CANC 를 주는 오분류는 구조적으로 못 잡는다
# (2026-07-29 NPB 9월 71건). TheSports 는 IP whitelist 라 Vercel 에서 호출이 안 되므로
# whitelist 등록된 이 맥미니가 그 구멍을 맡는다.
#
# 안전선: ts 가 Not Started(status_id 0·1) 로 주는 건만 SCHEDULED 로 되돌린다. 날짜(±1일)
#   + 팀쌍 완전일치로 대조하고, 대조 못한 건은 손대지 않고 경고만 남긴다.
set -e
set -o pipefail
cd ~/dev/scorebase
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:$PATH"

LOGF=/tmp/weekly-baseball-postponed-verify.out
log() { echo "[baseball-verify $(date '+%F %T')] $1"; }
log "▶ 시작"

# repo 최신화 — 검증 스크립트 최신 기준
git fetch origin main -q && git reset --hard origin/main -q

npx tsx scripts/verify-baseball-postponed-ts.ts --apply 2>&1 | tee "$LOGF" | tail -20

# 실제로 데이터를 바꿨을 때만 알린다 (0건이면 조용히).
# ⚠️ grep 파이프로 세지 말 것 — 정정 0건(평상시)이면 grep 이 exit 1 을 내고
#    set -e + pipefail 이 그걸 잡아 스크립트가 죽는다. 매주 실패로 기록되고
#    heartbeat 가 ok:false 를 쏜다 (2026-07-29 첫 실행에서 실측, exit 1).
#    awk 는 매치가 없어도 exit 0 이라 안전하다.
FIXED=$(awk 'match($0, /SCHEDULED 정정 [0-9]+건 적용/) {
    n=$0; sub(/.*SCHEDULED 정정 /,"",n); sub(/건 적용.*/,"",n); s+=n
  } END { print s+0 }' "$LOGF")
if [ "${FIXED:-0}" -gt 0 ]; then
  set -a; . .env.local; set +a
  BODY=$(grep -E '^===|ts Not Started|정정' "$LOGF" | head -20)
  curl -sS -m 15 -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "parse_mode=HTML" \
    --data-urlencode "text=⚾ <b>야구 미래 POSTPONED ${FIXED}건 → SCHEDULED 정정</b>
📍 <b>무엇</b>: TheSports 교차 대조로 오분류 확정 (api-baseball 이 CANC 로 주지만 ts 는 Not Started)
💥 <b>영향</b>: monte-carlo 는 SCHEDULED 만 시뮬 — 방치 시 /predictions 잔여 일정 과소 계산
➡️ <b>확인</b>: /predictions/NPB · /predictions/KBO

<code>$(printf '%s' "$BODY")</code>" >/dev/null || true
  log "✓ 텔레그램 알림 발송 (${FIXED}건)"
else
  log "정정 0건 — 알림 생략"
fi
log "✓ 종료"
