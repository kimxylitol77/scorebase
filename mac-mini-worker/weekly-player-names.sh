#!/bin/zsh
# heartbeat v2 — 성공/실패+에러를 EXIT 에서 자동 보고 (hb-lib.sh)
source "$HOME/dev/scorebase/mac-mini-worker/hb-lib.sh"
hb_trap mac-mini-weekly-player-names /tmp/weekly-player-names.log
# 주 1회 — MLB 선수명 사전 자동 보강 + git push.
# 1) 네이버 source (정확한 표기, starter 중심)
# 2) Haiku 음역 (네이버 누락 선수 자동 보강)
set -e
set -o pipefail   # 사전 생성이 `| tail` 뒤에서 죽어도 rc 를 전파시킨다 — 파이프는
                  # 마지막 명령의 exit code 를 주므로 없으면 실패가 통과로 읽힌다.
cd ~/dev/scorebase
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"

if [ -f mac-mini-worker/.env ]; then set -a; . mac-mini-worker/.env; set +a; fi

LOG_PREFIX="[weekly-player-names $(date '+%Y-%m-%d %H:%M:%S')]"
echo "$LOG_PREFIX ▶ 시작"

git fetch origin main
git reset --hard origin/main

echo "$LOG_PREFIX ▶ 1/2 MLB 네이버 사전 빌드 (14일)"
npx --yes tsx --env-file=.env.local scripts/build-mlb-player-names-naver.ts 14 2>&1 | tail -3

echo "$LOG_PREFIX ▶ 2/2 MLB Haiku 음역 (네이버 누락만)"
ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-claude-haiku-4-5-20251001}" \
  npx --yes tsx --env-file=.env.local scripts/build-mlb-player-names-haiku.ts 14 2>&1 | tail -10

CHANGED=$(git status --short src/lib/sports/mlb-player-names-naver.ts src/lib/sports/mlb-player-names-haiku.ts | wc -l | tr -d ' ')
if [ "$CHANGED" -eq 0 ]; then
  echo "$LOG_PREFIX 변경 없음 — push skip"
  ADDED=0
else
  git add src/lib/sports/mlb-player-names-naver.ts src/lib/sports/mlb-player-names-haiku.ts
  git -c user.email="bot@scorebase.kr" -c user.name="scorebase-mimi-bot" \
    commit -m "chore(player-names): weekly MLB 사전 자동 보강 (naver + Haiku)"
  # 단발 push 였다 — 거부되면 set -e 로 즉사하고, 다음 주 실행 상단의 `reset --hard` 가
  # 방금 만든 커밋을 지운다(주간 사전 보강이 조용히 사라진다). 공용 재시도 함수를 쓴다.
  . "$HOME/dev/scorebase/mac-mini-worker/git-push-lib.sh"
  if ! git_push_with_retry; then
    echo "$LOG_PREFIX ❌ push 최종 실패 — 커밋은 로컬 보존(다음 실행 reset 에 지워짐)"
    exit 1
  fi
  echo "$LOG_PREFIX ✓ push 완료"
  ADDED=$CHANGED
fi

curl -sS -X POST "${SITE_URL:-https://www.scorebase.kr}/api/internal/bot-heartbeat" \
  -H "Authorization: Bearer ${INTERNAL_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"mac-mini-weekly-player-names\",\"metadata\":{\"changed\":${ADDED}}}" >/dev/null || true

echo "$LOG_PREFIX ◀ 종료"
