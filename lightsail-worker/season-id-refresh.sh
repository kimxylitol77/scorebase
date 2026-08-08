#!/bin/bash
# TheSports 시즌 id 주간 재발굴 — Vultr(화이트리스트 IP)에서 실행 (2026-08-08).
# 흐름: repo 동기화 → build-thesports-season-ids 실행 → 매핑 변경 시 커밋·push(→Vercel 자동배포)
#       + 워커 사본 교체·poller 재시작. 시즌 롤오버 때 순위표가 지난 시즌에 동결되던 것의 자동화.
set -euo pipefail
REPO=/home/ubuntu/scorebase-repo
WORKER_SRC=/home/ubuntu/scorebase-worker/src
MAP=src/lib/sports/thesports/league-id-mapping.json
export HOME=/home/ubuntu
cd "$REPO"

echo "[$(date -u +%FT%TZ)] ▶ season-id-refresh 시작"
git fetch -q origin main
git reset -q --hard origin/main

# ts 자격증명 — 워커 공용 env 에서 (스크립트는 process.env 폴백 지원)
set -a; . /home/ubuntu/.env; set +a
npx -y tsx scripts/build-thesports-season-ids.ts

if git diff --quiet -- "$MAP"; then
  echo "  변경 없음 — 종료"
  exit 0
fi

echo "  매핑 변경 감지 → 커밋·push"
git config user.name "scorebase-season-bot"
git config user.email "bot@scorebase.kr"
git add "$MAP"
git commit -q -m "chore(thesports): 시즌 id 주간 자동 갱신 — Vultr season-id-refresh"
git push -q origin HEAD:main

echo "  워커 사본 교체 + poller 재시작"
cp "$REPO/$MAP" "$WORKER_SRC/league-id-mapping.json"
chown ubuntu:ubuntu "$WORKER_SRC/league-id-mapping.json"
systemctl restart scorebase-standings-poller scorebase-football-match-collector
echo "[$(date -u +%FT%TZ)] ✓ 완료"
