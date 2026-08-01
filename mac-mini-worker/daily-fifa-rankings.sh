#!/bin/zsh
# heartbeat v2 — 성공/실패+에러를 EXIT 에서 자동 보고 (hb-lib.sh)
source "$HOME/dev/scorebase/mac-mini-worker/hb-lib.sh"
hb_trap mac-mini-daily-fifa-rankings /tmp/daily-fifa-rankings.log
# 매일 06:40 KST — FIFA 남자 랭킹을 TheSports 에서 받아 정적 JSON 자동 갱신 + push.
#
# 왜 필요한가. /predictions/fifa-ranking 과 매치 카드 [FIFA N위] 칩이 수동 교체되는
# 정적 JSON 을 읽는데, 2026-04-01 이후 방치돼 월드컵 이후 발표(7/19, 스페인 1위)가
# 넉 달 가까이 반영 안 됐다. FIFA 발표는 연 6회 안팎이라 대부분의 날은 "발표일 동일 —
# 갱신할 것 없음"으로 끝난다(API 1회 호출, push 없음). 이 머신 IP = TheSports whitelist.
#
# 안전선(스크립트 내장): 200개국 미만·미확인 표기 5% 초과·발표일 역행이면 중단.
# 여기서는 ① 이 2개 json 만 add ② 실패 시 push 안 함 ③ 변경 없으면 commit 생략.
set -e
set -o pipefail
cd ~/dev/scorebase
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:$PATH"
if [ -f mac-mini-worker/.env ]; then set -a; . mac-mini-worker/.env; set +a; fi

log() { echo "[fifa-rankings $(date '+%F %T')] $1"; }
log "▶ 시작"

git fetch origin main -q && git reset --hard origin/main -q

npx tsx --env-file=.env.local scripts/refresh-fifa-rankings.ts --write 2>&1 | tail -6

FILES="src/lib/sports/fifa-rankings.json src/lib/sports/fifa-rankings-meta.json"
if git diff --quiet -- $FILES; then
  log "변경 없음 — push 생략"
else
  PUB=$(node -e "console.log(JSON.parse(require('fs').readFileSync('src/lib/sports/fifa-rankings-meta.json','utf8')).pubDate)")
  git add $FILES
  git commit -m "chore(data): FIFA 랭킹 자동 갱신 — ${PUB} 발표 반영 (mac-mini)" -q
  git push origin main -q
  log "✓ push 완료: $(git log --oneline -1)"
fi
log "✓ 종료"
