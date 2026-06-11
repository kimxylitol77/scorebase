#!/bin/zsh
# heartbeat v2 — 성공/실패+에러를 EXIT 에서 자동 보고 (hb-lib.sh)
source "$HOME/dev/scorebase/mac-mini-worker/hb-lib.sh"
hb_trap mac-mini-db-backup /tmp/db-backup.log
# 매일 04:30 KST — Neon production 전체 pg_dump 로컬 백업 (재해 복구용).
# Neon 자체 백업 외 우리 손에 있는 사본이 없던 공백을 메움 (2026-06-11 도입).
# custom format(-Fc, 압축) / 30일 보존 / 1MB 미만 덤프는 실패로 간주(부분 덤프 방어).
set -e
set -o pipefail
cd ~/dev/scorebase
export PATH="/opt/homebrew/opt/libpq/bin:/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:$PATH"
# DATABASE_URL — repo .env.local (worker .env 에는 없음)
if [ -f .env.local ]; then set -a; . ./.env.local; set +a; fi
if [ -f mac-mini-worker/.env ]; then set -a; . mac-mini-worker/.env; set +a; fi

DIR="$HOME/backups/scorebase"
mkdir -p "$DIR"
OUT="$DIR/scorebase-$(date +%F).dump"

echo "[db-backup $(date '+%F %T')] ▶ pg_dump 시작"
pg_dump "$DATABASE_URL" -Fc --no-owner --no-privileges -f "$OUT"

SIZE=$(stat -f%z "$OUT")
if [ "$SIZE" -lt 1000000 ]; then
  echo "❌ 덤프 비정상 (${SIZE}B < 1MB) — 부분/빈 덤프 의심"
  exit 1
fi

# 30일 초과 정리
find "$DIR" -name "scorebase-*.dump" -mtime +30 -delete

echo "[db-backup $(date '+%F %T')] ✓ 완료 $(du -h "$OUT" | cut -f1) | 보관 $(ls "$DIR" | wc -l | tr -d ' ')개"
