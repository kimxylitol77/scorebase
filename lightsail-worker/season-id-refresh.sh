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

# 워커 사본을 push 보다 먼저 갱신한다 — 순위표 동결을 푸는 건 이쪽이고, push(→Vercel)는
# 경합에 밀릴 수 있다. 순서가 반대면 push 실패 한 번에 워커까지 옛 매핑에 묶인다.
echo "  워커 사본 교체 + poller 재시작"
cp "$REPO/$MAP" "$WORKER_SRC/league-id-mapping.json"
chown ubuntu:ubuntu "$WORKER_SRC/league-id-mapping.json"
systemctl restart scorebase-standings-poller scorebase-football-match-collector

echo "  매핑 변경 감지 → 커밋·push"
git config user.name "scorebase-season-bot"
git config user.email "bot@scorebase.kr"
git add "$MAP"
git commit -q -m "chore(thesports): 시즌 id 주간 자동 갱신 — Vultr season-id-refresh"

# 단발 push 였다. 다른 잡이 먼저 올라가면 거부 → set -e 로 즉사 → 다음 주 실행 상단의
# `git reset --hard origin/main` 이 방금 커밋을 지운다(무성 유실, bot-push-race-data-loss).
# 맥미니 봇 5종이 쓰는 공용 재시도 함수를 그대로 쓴다.
. "$REPO/mac-mini-worker/git-push-lib.sh"
if ! git_push_with_retry HEAD:main; then
  echo "  ❌ push 최종 실패 — 커밋은 로컬 보존(다음 실행 reset 에 지워짐). 워커는 이미 갱신됨"
  exit 1
fi

echo "[$(date -u +%FT%TZ)] ✓ 완료"
