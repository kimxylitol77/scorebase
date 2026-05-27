#!/bin/zsh
# 일 1회 — KBO 선수명 (한글) 자동 보강.
# TheSports detailLive.players 등장 ts player_id 중 nameKo NULL 또는 row 없는 건만
# scripts/build-kbo-player-names-haiku.ts 가 채움 (TheSports player/list?uuid + Haiku 음역).
#
# 환경변수 ANTHROPIC_API_KEY (mac-mini-worker/.env), THESPORTS_USER, THESPORTS_SECRET 필수.
# 후자 2개는 Lightsail /home/ubuntu/.env 와 동일값으로 mac-mini-worker/.env 에 추가 필요.
# 누락 시 script 가 즉시 exit 1, 알림으로 가시화.

set -e
cd ~/dev/scorebase
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"

if [ -f mac-mini-worker/.env ]; then set -a; . mac-mini-worker/.env; set +a; fi

LOG_PREFIX="[daily-kbo-player-names $(date '+%Y-%m-%d %H:%M:%S')]"
echo "$LOG_PREFIX ▶ 시작"

git fetch origin main
git reset --hard origin/main

# 최근 3일 매치 cover — 일 1회면 새 등장 ts id 가 익일 03:00 안에 매핑됨.
# 7일 cover 도 alreadyMapped 는 skip 하므로 cost 증가 작음. 보수적으로 7.
echo "$LOG_PREFIX ▶ build-kbo-player-names-haiku 7일"
ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-claude-haiku-4-5-20251001}" \
THESPORTS_USER="$THESPORTS_USER" THESPORTS_SECRET="$THESPORTS_SECRET" \
  npx --yes tsx scripts/build-kbo-player-names-haiku.ts 7 2>&1 | tail -20

# bot-heartbeat — narrator 가 audit 화면에서 사용.
ADDED=$?
curl -sS -X POST "${SITE_URL:-https://www.scorebase.kr}/api/internal/bot-heartbeat" \
  -H "Authorization: Bearer ${INTERNAL_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"mac-mini-daily-kbo-player-names\",\"metadata\":{\"exitCode\":${ADDED}}}" >/dev/null || true

echo "$LOG_PREFIX ◀ 종료"
