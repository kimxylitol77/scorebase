#!/usr/bin/env bash
# uninstall.sh — 8 봇 launchd 등록 해제

set -e
TARGET_DIR="$HOME/Library/LaunchAgents"

BOTS=(
  "com.scorebase.match-narrator"
  "com.scorebase.endpoint-monitor"
  "com.scorebase.data-quality"
  "com.scorebase.api-quota"
  "com.scorebase.preview-coverage"
  "com.scorebase.live-scores-watcher"
  "com.scorebase.route-guardian"
  "com.scorebase.threads-auto-poster"
)

for bot in "${BOTS[@]}"; do
  plist="$TARGET_DIR/${bot}.plist"
  if [ -f "$plist" ]; then
    launchctl unload "$plist" 2>/dev/null || true
    rm -f "$plist"
    echo "  ✓ $bot — 해제"
  else
    echo "  - $bot — 등록 안 돼 있음"
  fi
done

# 백그라운드 nohup 프로세스도 정리 (혹시 launchd 외에 직접 실행했을 경우)
pkill -f match-narrator 2>/dev/null || true
pkill -f endpoint-monitor 2>/dev/null || true
pkill -f data-quality 2>/dev/null || true
pkill -f api-quota 2>/dev/null || true
pkill -f preview-coverage 2>/dev/null || true
pkill -f live-scores-watcher 2>/dev/null || true
pkill -f route-guardian 2>/dev/null || true
pkill -f threads-auto-poster 2>/dev/null || true

echo ""
echo "✓ 8 봇 모두 중지 + 등록 해제"
