#!/bin/zsh
# heartbeat v2 — 성공/실패+에러를 EXIT 에서 자동 보고 (hb-lib.sh)
source "$HOME/dev/scorebase/mac-mini-worker/hb-lib.sh"
hb_trap mac-mini-daily-official-korean /tmp/daily-official-korean.log
# 매일 03:30 KST — TheSports 공식 한국어명 → 축구 선수 nameKo(type=5) + 팀 Team.nameKo(type=4) 교체.
# 공식 우선 + 정규화(영문/콤마 노이즈 제거). haiku 봇(04:10)보다 먼저 = 공식 우선, 빈자리만 haiku fallback.
# 팀은 표시 단계에서 team-names.ts 사전이 항상 이기므로 잠금 없이 매일 덮어씀 (docs/team-nameko/).
# ⚠️ DB update 만 — git push/배포 없음 (무인 안전선). TheSports fetch 는 worker(IP whitelist) 경유.
set -e
set -o pipefail
cd ~/dev/scorebase
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
if [ -f mac-mini-worker/.env ]; then set -a; . mac-mini-worker/.env; set +a; fi

# 2026-07-12: Lightsail(15.164.60.238, 7/10 삭제) → Vultr 승계. 3일 연속 ssh timeout 실패 수리.
WORKER="root@64.176.230.240"
SSHOPT="-o ConnectTimeout=20 -o BatchMode=yes -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=120"

# TheSports 는 워커 IP 만 화이트리스트라 fetch 를 워커에서 돌린다. 그런데 2026-09-03 이전으로
# 이 스크립트 자체가 그 워커 위에서 돌게 됐고, 자기 자신에게 ssh 하다 매일
# "Permission denied (publickey)" 로 죽었다(heartbeat 도 같이 끊겨 있어 9/08 까지 무감지).
# 워커 위면 왕복 없이 그대로 로컬 실행한다.
if ip -4 addr show 2>/dev/null | grep -q "inet ${WORKER#*@}/"; then IS_WORKER=1; else IS_WORKER=0; fi

w_put() { # 로컬 스크립트 → 워커
  if [ "$IS_WORKER" = 1 ]; then [ "$1" = "$2" ] || cp -f "$1" "$2"; else scp ${=SSHOPT} "$1" "$WORKER:$2"; fi
}
w_run() { # 워커에서 실행
  if [ "$IS_WORKER" = 1 ]; then bash "$1"; else ssh ${=SSHOPT} "$WORKER" "bash $1"; fi
}
w_get() { # 워커 산출물 회수 (워커 위면 이미 로컬에 있다 — 존재만 확인)
  if [ "$IS_WORKER" = 1 ]; then [ -f "$1" ]; else scp ${=SSHOPT} "$WORKER:$1" "$2"; fi
}
LOG_PREFIX="[daily-official-korean $(date '+%Y-%m-%d %H:%M:%S')]"
echo "$LOG_PREFIX ▶ 시작"

# repo 최신화. ⚠️ 2026-08-22 부터 이 스크립트도 tracked 라 `reset --hard` 가 origin 버전으로
# 되돌린다 — 맥미니에서 직접 고치지 말고 repo 에 커밋할 것(편입 전에는 untracked 라 보존됐다).
git fetch origin main -q || true
git reset --hard origin/main -q || true
# schema 가 바뀌어도 client 동기 — playerMarketValue 모델 누락 크래시(2026-06-11) 재발 방지
npx --yes prisma generate >/dev/null 2>&1 || true

# 1. worker 에 fetch 스크립트 전송 + 실행 (TheSports IP whitelist = worker 만, ~12분)
echo "$LOG_PREFIX ▶ worker fetch (language type=5 전량)"
w_put scripts/fetch-thesports-language.sh /tmp/fetch-thesports-language.sh
w_run /tmp/fetch-thesports-language.sh 2>&1 | tail -3

# 2. 결과 회수
w_get /tmp/lang-player-ko.jsonl /tmp/lang-player-ko.jsonl
echo "$LOG_PREFIX ▶ 수집 $(wc -l < /tmp/lang-player-ko.jsonl) 명"

# 3. DB 적용 (공식 우선 + 정규화, 멱등)
echo "$LOG_PREFIX ▶ DB 적용"
npx --yes tsx --env-file=.env.local scripts/apply-thesports-official-korean.ts --apply 2>&1 | tail -5

# 4. 팀 공식 한국어명 (type=4) — 선수와 같은 경로, ~1분으로 짧음
echo "$LOG_PREFIX ▶ worker fetch (language type=4 팀)"
w_put scripts/fetch-thesports-language-team.sh /tmp/fetch-thesports-language-team.sh
w_run /tmp/fetch-thesports-language-team.sh 2>&1 | tail -3
w_get /tmp/lang-team-ko.jsonl /tmp/lang-team-ko.jsonl
echo "$LOG_PREFIX ▶ 팀 수집 $(wc -l < /tmp/lang-team-ko.jsonl) 건"
echo "$LOG_PREFIX ▶ 팀 DB 적용"
npx --yes tsx --env-file=.env.local scripts/apply-thesports-team-nameko.ts --apply 2>&1 | tail -5

echo "$LOG_PREFIX ✓ 종료"
