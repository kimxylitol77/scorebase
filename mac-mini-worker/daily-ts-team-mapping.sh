#!/bin/zsh
# heartbeat v2 — 성공/실패+에러를 EXIT 에서 자동 보고 (hb-lib.sh)
source "$HOME/dev/scorebase/mac-mini-worker/hb-lib.sh"
source "$HOME/dev/scorebase/mac-mini-worker/git-push-lib.sh"  # git_push_with_retry — push 경합 시 rebase 재시도
hb_trap mac-mini-daily-ts-team-mapping /tmp/daily-ts-team-mapping.log
# 매일 06:20 KST — ts- externalId 팀을 team-id-mapping.json 에 백필 + 자동 push.
#
# 왜 매일인가.
#   시즌 전환 검증의 팀 매핑률 95% 기준은 새 시즌 승격팀이 우리 DB 에 들어오기 전엔 못 넘는다.
#   Team row 는 그 팀 경기가 수집돼야 생기므로 개막 직후 며칠에 걸쳐 하나씩 채워진다.
#   주간으로 돌리면 그동안 새 시즌이 DISCOVERED 에 묶여 순위가 안 뜬다(2026-07-31 실측:
#   CZECH_2·DENMARK_2·AUSTRIA_2·HUNGARY_2·BUNDESLIGA 가 누락 3~5팀 때문에 67~83% 로 정체).
#   외부 API 호출이 없고 DB 읽기 + JSON 쓰기뿐이라 매일 돌려도 비용이 사실상 0.
#
# 왜 weekly-static-refresh 에 안 넣었나.
#   그 잡의 안전선이 "data/*.json 만 add (코드 절대 미포함)" 다. 이 파일은 src/ 아래라
#   거기 끼워 넣으면 그 안전선을 약화시킨다. 파일 하나만 만지는 별도 잡으로 분리한다.
#
# 안전선: ① 이 json 한 개만 add ② 항목 수 감소 시 중단(백필은 추가 전용) ③ 실패 시 push 안 함.
set -e
set -o pipefail
cd ~/dev/scorebase
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:$PATH"
if [ -f mac-mini-worker/.env ]; then set -a; . mac-mini-worker/.env; set +a; fi

MAP=src/lib/sports/thesports/team-id-mapping.json
log() { echo "[ts-team-mapping $(date '+%F %T')] $1"; }
log "▶ 시작"

# repo 최신화 — 다른 세션이 매핑을 손댔을 수 있다
git fetch origin main -q && git reset --hard origin/main -q
npx --yes prisma generate >/dev/null 2>&1 || true

BEFORE=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$MAP','utf8')).length)")
log "현재 항목 $BEFORE"

npx tsx --env-file=.env.local scripts/backfill-ts-team-mapping.ts --write 2>&1 | tail -12

AFTER=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$MAP','utf8')).length)")

# ── 가드 — 백필은 추가 전용이라 줄어들면 무언가 잘못된 것 ──
if [ "$AFTER" -lt "$BEFORE" ]; then
  echo "❌ 항목 수 감소 ($BEFORE → $AFTER) — push 중단"
  git checkout -- "$MAP" 2>/dev/null || true
  exit 1
fi

if git diff --quiet -- "$MAP"; then
  log "변경 없음 — push 생략 (항목 $AFTER)"
else
  git add "$MAP"
  git commit -m "chore(data): ts 팀 매핑 자동 백필 $BEFORE → $AFTER (mac-mini)" -q
  if ! git_push_with_retry; then
    log "❌ push 최종 실패 — 커밋은 로컬에 보존됨. 다음 실행의 reset 전에 회수 필요"
    exit 1
  fi
  log "✓ push 완료: $(git log --oneline -1)"
fi
log "✓ 종료"
