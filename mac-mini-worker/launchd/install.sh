#!/usr/bin/env bash
# install.sh — Mac mini launchd 등록 (10 봇 모두)
# 부팅 시 자동 시작 + 크래시 시 자동 재시작 (KeepAlive)
#
# 사용:
#   cd ~/dev/scorebase/mac-mini-worker/launchd
#   bash install.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$HOME/Library/LaunchAgents"
mkdir -p "$TARGET_DIR"

BOTS=(
  "com.scorebase.match-narrator"
  "com.scorebase.endpoint-monitor"
  "com.scorebase.data-quality"
  "com.scorebase.api-quota"
  "com.scorebase.preview-coverage"
  "com.scorebase.live-scores-watcher"
  "com.scorebase.route-guardian"
  "com.scorebase.threads-auto-poster"
  "com.scorebase.stale-ts-verify"
  "com.scorebase.football-incidents-backfill"
)

# Node 경로 자동 감지 (brew 위치 따라 다름)
NODE_PATH="$(which node 2>/dev/null || echo /usr/local/bin/node)"
if [ ! -x "$NODE_PATH" ]; then
  echo "❌ node 못 찾음. brew install node 필요."
  exit 1
fi
echo "✓ node: $NODE_PATH"

# 사용자 홈 자동 감지 — plist 의 /Users/kkulkkul 자리에 실제 값
USER_HOME="$HOME"

echo ""
echo "▶ 9 봇 launchd 등록"
echo ""

for bot in "${BOTS[@]}"; do
  src="$SCRIPT_DIR/${bot}.plist"
  dst="$TARGET_DIR/${bot}.plist"

  if [ ! -f "$src" ]; then
    echo "  ✗ $bot — plist 없음: $src"
    continue
  fi

  # plist 의 /usr/local/bin/node → 실제 node 경로 + /Users/kkulkkul → 실제 홈
  sed -e "s|/usr/local/bin/node|$NODE_PATH|g" \
      -e "s|/Users/kkulkkul|$USER_HOME|g" \
      "$src" > "$dst"

  # 기존 등록 unload (재설치 대비)
  launchctl unload "$dst" 2>/dev/null || true

  # 등록 + 즉시 시작 (RunAtLoad)
  launchctl load -w "$dst"
  echo "  ✓ $bot — 등록 + 시작"
done

echo ""
echo "▶ 등록된 봇 확인"
launchctl list | grep -E "scorebase\." | awk '{ printf "  [%s] %s\n", $1, $3 }'

echo ""
echo "▶ 로그 위치 — tail -f /tmp/{match-narrator,endpoint-monitor,data-quality,api-quota,preview-coverage,live-scores-watcher,route-guardian,threads-auto-poster,stale-ts-verify}.log"
echo "▶ 중지: bash uninstall.sh"
