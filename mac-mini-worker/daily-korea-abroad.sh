#!/bin/zsh
# heartbeat v2 — 성공/실패+에러를 EXIT 에서 자동 보고 (hb-lib.sh)
source "$HOME/dev/scorebase/mac-mini-worker/hb-lib.sh"
hb_trap mac-mini-daily-korea-abroad /tmp/daily-korea-abroad.log
# push 경합(non-fast-forward)에 그날 데이터를 버리지 않도록 rebase 재시도를 쓴다
source "$HOME/dev/scorebase/mac-mini-worker/git-push-lib.sh"
# 매일 07:20 KST — 해외파 한국 선수 현재 시즌 기록(/soccer/korea 2026-27 탭) 재집계 + data json push.
#   유럽 경기가 KST 새벽에 끝나므로 07:20 이면 당일 반영된다.
#   weekly-static-refresh(일 05:00)의 ⑧-b 는 af 국적 스캔(~800콜)으로 **명단과 지난 시즌 확정 기록**을 만든다.
#   현재 시즌 기록은 ts 리그당 1콜(총 23콜)이라 매일 돌려도 부담이 없어 이 잡으로 분리했다.
# 안전선: ① data/korea-abroad.json 만 add (코드 절대 미포함) ② 빈 파일 가드 ③ 실패 시 push 안 함.
set -e
set -o pipefail
cd ~/dev/scorebase
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:$PATH"
if [ -f mac-mini-worker/.env ]; then set -a; . mac-mini-worker/.env; set +a; fi

log() { echo "[korea-abroad $(date '+%F %T')] $1"; }
log "▶ 시작"

# repo 최신화 — 빌더 코드·명단 최신 기준
git fetch origin main -q && git reset --hard origin/main -q

# 현재 시즌 기록 — ts season/recent/player/stat (리그당 1콜, 국적 KOR 필터)
log "▶ 현재 시즌 기록 갱신"
npx tsx --env-file=.env.local scripts/refresh-korea-abroad-current.ts 2>&1 | tail -6

# 선수 페이지 시즌 상세(레이더)도 같은 ts 소스로 일간 갱신 — 주간 af 빌드만으론
# 시즌 개막·경기 다음 날에도 지난 시즌이 보였다(2026-08-20 이강인 실측). 리그당 1콜 ×15.
log "▶ 선수 시즌스탯(전 리그) 갱신"
npx tsx --env-file=.env.local scripts/refresh-current-season-stats.ts 2>&1 | tail -4

# 빈 파일 가드 — 응답 이상으로 데이터가 쪼그라들면 push 중단
SIZE=$(stat -f%z data/korea-abroad.json 2>/dev/null || echo 0)
if [ "$SIZE" -lt 10000 ]; then
  echo "❌ data/korea-abroad.json 비정상 (${SIZE}B) — push 중단"
  git checkout -- data/ 2>/dev/null || true
  exit 1
fi
STAT_SIZE=$(stat -f%z data/player-season-stats.json 2>/dev/null || echo 0)
if [ "$STAT_SIZE" -lt 1000000 ]; then
  echo "❌ data/player-season-stats.json 비정상 (${STAT_SIZE}B) — push 중단"
  git checkout -- data/ 2>/dev/null || true
  exit 1
fi

if git diff --quiet -- data/korea-abroad.json data/player-season-stats.json data/player-photos.json; then
  log "변경 없음 — push 생략"
else
  git add data/korea-abroad.json data/player-season-stats.json data/player-photos.json
  git commit -m "chore(data): 해외파·선수 시즌스탯 현재 시즌 자동 갱신 (mac-mini)" -q
  if ! git_push_with_retry; then
    log "❌ push 최종 실패 — 커밋은 로컬 보존"
    exit 1
  fi
  log "✓ push 완료: $(git log --oneline -1)"
fi
log "✓ 종료"
