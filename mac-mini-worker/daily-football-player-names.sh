#!/bin/zsh
# heartbeat v2 — 성공/실패+에러를 EXIT 에서 자동 보고 (hb-lib.sh)
source "$HOME/dev/scorebase/mac-mini-worker/hb-lib.sh"
hb_trap mac-mini-daily-football-player-names /tmp/daily-football-player-names.log
# 매일 — 축구 라인업 선수명 한글화 (TheSportsPlayer.nameKo DB upsert).
# 야구 선수명(lightsail kbo-player-names.timer 03:00 KST)이 커버 못 하는 유일한 구멍.
# ⚠️ DB upsert 만 — git push/배포 없음 (자기 전 무인 안전선).
set -e
set -o pipefail   # build 가 batch 중간에 죽어도 | tail 너머로 rc 전파 (부분실패 위장 방지)
cd ~/dev/scorebase
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"

# mac-mini-worker/.env 에서 ANTHROPIC_API_KEY / INTERNAL_API_TOKEN / SITE_URL 로드
if [ -f mac-mini-worker/.env ]; then set -a; . mac-mini-worker/.env; set +a; fi

LOG_PREFIX="[daily-football-player-names $(date '+%Y-%m-%d %H:%M:%S')]"
echo "$LOG_PREFIX ▶ 시작"

# repo 최신화. ⚠️ 2026-08-22 부터 이 스크립트도 tracked 라 `reset --hard` 가 origin 버전으로
# 되돌린다 — 맥미니에서 직접 고치지 말고 repo 에 커밋할 것(편입 전에는 untracked 라 보존됐다).
git fetch origin main -q || true
git reset --hard origin/main -q || true

echo "$LOG_PREFIX ▶ 축구 라인업 선수명 음역 → DB upsert"
# 일시 네트워크(ETIMEDOUT to anthropic) 대비 3회 재시도. 각 실행은 미음역분만 처리(점진 수렴).
ok=0
for attempt in 1 2 3; do
  echo "$LOG_PREFIX ── 시도 $attempt/3 ──"
  if ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
     ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-claude-haiku-4-5-20251001}" \
     npx --yes tsx --env-file=.env.local scripts/build-football-player-names-haiku.ts 0 2>&1 | tail -25; then
    ok=1; echo "$LOG_PREFIX ✓ 음역 성공 (시도 $attempt)"; break
  fi
  echo "$LOG_PREFIX ⚠ 시도 $attempt 실패 (일시 네트워크 추정) — 15초 후 재시도"
  sleep 15
done
[ "$ok" = "1" ] || echo "$LOG_PREFIX ❌ 3회 모두 실패 — 다음 cron(내일 04:10)에서 미처리분 재시도"


echo "$LOG_PREFIX ✓ 종료 (음역 성공=$ok)"
