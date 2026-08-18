#!/bin/zsh
# heartbeat v2 — 성공/실패+에러를 EXIT 에서 자동 보고 (hb-lib.sh)
source "$HOME/dev/scorebase/mac-mini-worker/hb-lib.sh"
hb_trap mac-mini-daily-dup-cleanup /tmp/daily-dup-cleanup.log
# 매일 10:30 KST — ts 이중저장 Match 중복(SAFE=종료+참조0)만 자동 삭제.
# collect 가드가 못 잡는 '사후 startTime 이동' 중복을 시각 확정(종료) 후 정리한다.
# 안전선: --apply 만(--merge 미포함) → 발행 콘텐츠가 걸린 MANUAL 은 자동 병합 안 하고
#   사람 검토로 남긴다. SCHEDULED(미래)·LIVE·ANOMALY 는 스크립트가 원천 스킵.
set -e
set -o pipefail
cd ~/dev/scorebase
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:$PATH"

log() { echo "[dup-cleanup $(date '+%F %T')] $1"; }
log "▶ 시작"

# repo 최신화 — 정리 스크립트 최신 기준
git fetch origin main -q && git reset --hard origin/main -q

# SAFE 자동 삭제 (참조 0 종료매치 중복). MANUAL/PENDING/LIVE/ANOMALY 는 스킵.
npx tsx --env-file=.env.local scripts/cleanup-duplicate-matches.ts --apply 2>&1 | tail -8

# 주 1회(월) — Team.league 라벨 교정 (승격·강등·컵/친선 오염 반영).
# 리더보드 정합성 MED 가 매일 40여 건 반복되던 근본 원인이 라벨 방치였다(2026-08-18 실측
# 96팀 오염). 최근 45일+향후 편성 다수결이라 멱등이고, 시즌 진행에 따라 남은 전환도
# 자동 수렴한다. 이 파일은 위 git reset 으로 자기 갱신되므로 별도 배포 불요.
if [[ $(date +%u) == 1 ]]; then
  log "▶ 주간 Team.league 라벨 교정"
  npx tsx --env-file=.env.local scripts/fix-team-league-labels.ts --apply 2>&1 | tail -6
fi

log "✓ 종료"
