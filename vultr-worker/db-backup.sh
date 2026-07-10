#!/bin/bash
# Neon production 전체 pg_dump 일일 백업 — 매일 19:30 UTC (04:30 KST), systemd timer.
# 2026-07-10 맥미니에서 이관 (집 회선 저하로 12시간 소요 → Vultr 39초).
# custom format(-Fc) / 30일 보존 / 1MB 미만·30분 초과=실패.
# 실패 → 텔레그램 직접 알림 + heartbeat ok:false. 성공 → heartbeat ok:true (무음사망은 bot-heartbeat-check 가 감지).
set -euo pipefail
set -a; . /root/scorebase-backup/.env; set +a

DIR=/root/scorebase-backup/dumps
LOG=/root/scorebase-backup/backup.log
OUT="$DIR/scorebase-$(date +%F).dump"
START=$(date +%s)
mkdir -p "$DIR"

hb() { # $1 ok, $2 error
  local dur=$(( ($(date +%s) - START) * 1000 ))
  curl -sS -m 15 -X POST "https://www.scorebase.kr/api/internal/bot-heartbeat" \
    -H "Authorization: Bearer ${INTERNAL_API_TOKEN}" -H "Content-Type: application/json" \
    -d "{\"name\":\"vultr-db-backup\",\"ok\":$1,\"durationMs\":$dur,\"error\":\"$2\"}" >/dev/null 2>&1 || true
}
notify() {
  [ -n "${TELEGRAM_BOT_TOKEN:-}" ] || return 0
  curl -sf -m 10 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d chat_id="${TELEGRAM_CHAT_ID}" -d text="$1" >/dev/null || true
}
fail() { # $1 사유
  echo "[db-backup $(date -u +%FT%TZ)] ❌ $1" >> "$LOG"
  rm -f "$OUT"
  notify "🚨 [vultr-db-backup] $1"
  hb false "$1"
  exit 1
}

echo "[db-backup $(date -u +%FT%TZ)] ▶ 시작" >> "$LOG"
timeout 1800 pg_dump "$DATABASE_URL" -Fc --no-owner --no-privileges -f "$OUT" || fail "pg_dump 실패 또는 30분 타임아웃"

SIZE=$(stat -c%s "$OUT")
[ "$SIZE" -ge 1000000 ] || fail "덤프 크기 비정상 (${SIZE}B < 1MB)"

find "$DIR" -name "scorebase-*.dump" -mtime +30 -delete
echo "[db-backup $(date -u +%FT%TZ)] ✓ 완료 $(du -h "$OUT" | cut -f1) | 보관 $(ls "$DIR" | wc -l)개" >> "$LOG"
hb true ""
