#!/bin/zsh
# 팀 공식 스쿼드 일일 갱신 — data/team-squads.json 만.
#
# 왜 주간에서 떼어냈나. 선수단 스냅샷은 weekly-static-refresh(일 05:30) 안에 묶여 있어
# 갱신이 주 1회였다. 이적창이 열려 있으면 그 주기로는 최대 7일치 영입이 팀 페이지
# 선수단에서 빠진다 — 이적 섹션은 af 실시간이라 "영입은 떴는데 선수단엔 없다"는
# 자기모순이 그대로 노출됐다 (2026-08-27 실측: 실이적 82명 누락, PSG 미카 호츠 제보).
# 주간 잡이 한 번 걸러도 스쿼드만은 다음 날 따라잡게 분리한다.
#
# 비용은 ts 팀당 1콜(190콜). 빌더는 병합식이라 응답 못 받은 팀은 옛 값을 유지한다.
# 이 머신 IP = TheSports whitelist.
#
# ⚠ 주간 잡과 달리 `git reset --hard` 를 하지 않는다 — 장시간 잡의 미커밋 산출물을
#   새벽에 날린 전례가 있다. 코드 최신화는 주간 잡에 맡기고 여기선 data 만 건드린다.
mkdir -p "$HOME/dev/scorebase/logs"
source "$HOME/dev/scorebase/mac-mini-worker/hb-lib.sh"
source "$HOME/dev/scorebase/mac-mini-worker/git-push-lib.sh"
hb_trap mac-mini-daily-team-squads "$HOME/dev/scorebase/logs/daily-team-squads.log"
set -e
set -o pipefail
cd ~/dev/scorebase
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:$PATH"
if [ -f mac-mini-worker/.env ]; then set -a; . mac-mini-worker/.env; set +a; fi

SQUADS=data/team-squads.json
log() { echo "[daily-team-squads $(date '+%F %T')] $1"; }
log "▶ 시작"

# 전 상태 스냅샷 — 아래 급감 가드의 기준
BEFORE_TEAMS=$(python3 -c "import json;print(len(json.load(open('$SQUADS'))))")
BEFORE_PLAYERS=$(python3 -c "import json;print(sum(len(v['squad']) for v in json.load(open('$SQUADS')).values()))")
cp "$SQUADS" /tmp/team-squads.before.json
log "전: ${BEFORE_TEAMS}팀 / ${BEFORE_PLAYERS}명"

npx tsx --env-file=.env.local scripts/build-team-squads.ts 2>&1 | tail -3

AFTER_TEAMS=$(python3 -c "import json;print(len(json.load(open('$SQUADS'))))")
AFTER_PLAYERS=$(python3 -c "import json;print(sum(len(v['squad']) for v in json.load(open('$SQUADS')).values()))")
log "후: ${AFTER_TEAMS}팀 / ${AFTER_PLAYERS}명"

# ── 급감 가드 ──
# 팀이 사라지거나 총원이 5% 넘게 빠지면 ts 부분 응답으로 본다. 이적창 물갈이는
# 하루에 그만큼 움직이지 않는다 (2026-08-27 전량 재수집 실측: 빠짐 273/들어옴 279, 순증 +6).
# 되돌리고 실패로 끝낸다 — 반쪽 명단을 화면에 올리느니 어제 값이 낫다.
if [ "$AFTER_TEAMS" -lt "$BEFORE_TEAMS" ]; then
  log "❌ 팀이 줄었습니다 ${BEFORE_TEAMS} → ${AFTER_TEAMS} — 되돌리고 중단"
  cp /tmp/team-squads.before.json "$SQUADS"
  exit 1
fi
FLOOR=$(( BEFORE_PLAYERS * 95 / 100 ))
if [ "$AFTER_PLAYERS" -lt "$FLOOR" ]; then
  log "❌ 총원이 급감했습니다 ${BEFORE_PLAYERS} → ${AFTER_PLAYERS} (하한 ${FLOOR}) — 되돌리고 중단"
  cp /tmp/team-squads.before.json "$SQUADS"
  exit 1
fi

# ── data/team-squads.json 만 commit/push ──
if git diff --quiet -- "$SQUADS"; then
  log "변경 없음 — push 생략"
else
  git add "$SQUADS"
  git commit -q -m "chore(data): 팀 스쿼드 일일 갱신 — ${AFTER_TEAMS}팀 / ${AFTER_PLAYERS}명 (mac-mini)"
  if ! git_push_with_retry; then
    log "❌ push 최종 실패 — 커밋은 로컬에 보존됨"
    exit 1
  fi
  log "✓ push 완료: $(git log --oneline -1)"
fi
log "✓ 종료"
