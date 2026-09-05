#!/bin/zsh
# heartbeat v2 — 성공/실패+에러를 EXIT 에서 자동 보고 (hb-lib.sh)
source "$HOME/dev/scorebase/mac-mini-worker/hb-lib.sh"
source "$HOME/dev/scorebase/mac-mini-worker/git-push-lib.sh"  # git_push_with_retry — push 경합 시 rebase 재시도
hb_trap mac-mini-daily-golf-korea /tmp/daily-golf-korea.log
# 매일 09:00 KST — 골프 한국 선수 시즌 성적(/golf/korea) 재집계 + data json 자동 push.
# weekly-static-refresh(일 05:00)로는 미국 일요일 종료 대회가 최대 6일 지연돼 별도 daily 로 분리.
#   (미국 대회 종료 = KST 월요일 오전 → 09:00 실행이면 당일 반영)
# 안전선: ① data/*.json 만 add (코드 절대 미포함) ② 빈 파일 가드 ③ 실패 시 push 안 함.
set -e
set -o pipefail
cd ~/dev/scorebase
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:$PATH"
if [ -f mac-mini-worker/.env ]; then set -a; . mac-mini-worker/.env; set +a; fi

log() { echo "[golf-korea $(date '+%F %T')] $1"; }
log "▶ 시작"

# repo 최신화 — 빌더 코드/사전 최신 기준
git fetch origin main -q && git reset --hard origin/main -q

# 집계 — ESPN 시즌 리더보드(PGA·LPGA) → data/golf-korea-season.json
# 신규 선수만 Haiku 음역(멱등) → 평시 비용 0. 셸 빈 키 export 회피 위해 env -u 패턴.
log "▶ 한국 선수 시즌 집계"
env -u ANTHROPIC_API_KEY zsh -c 'set -a; . mac-mini-worker/.env; set +a; npx tsx scripts/build-golf-korea-season.ts' 2>&1 | tail -4

# 세계랭킹(남자 OWGR) — 공식 API top100 → data/golf-world-rankings.json.
# OWGR 은 매주 월요일(KST) 갱신이라 daily 로 두면 당일 반영. Haiku 미사용(기존 사전 재사용)이라 비용 0.
log "▶ 세계랭킹(남자 OWGR)"
npx tsx scripts/build-golf-world-rankings.ts 2>&1 | tail -2 || true

# 빈 파일 가드 — 응답 이상으로 데이터가 쪼그라들면 push 중단
for f in data/golf-korea-season.json data/golf-world-rankings.json; do
  # ⚠ 크기 검증은 wc 로 한다 — `stat -f%z` 는 BSD(맥) 전용이라 리눅스에서 실패하고
  #   `|| echo 0` 에 걸려 **항상 0B** 로 읽힌다. 그러면 이 가드가 매번 트립해
  #   산출물이 조용히 커밋되지 않는다 (2026-09-05 Vultr 이전 후 실측: 히트맵 4주치 유실).
  SIZE=$( { wc -c < "$f" 2>/dev/null || echo 0; } | tr -d "[:space:]" )
  if [ "$SIZE" -lt 10000 ]; then
    echo "❌ $f 비정상 (${SIZE}B) — push 중단"
    git checkout -- data/ 2>/dev/null || true
    exit 1
  fi
done

# data/*.json 변경분만 commit/push (updatedAt 만 바뀐 경우도 포함 — 최신 갱신 시각 노출용)
if git diff --quiet -- data/; then
  log "변경 없음 — push 생략"
else
  git add data/golf-korea-season.json data/golf-player-names.json data/golf-world-rankings.json
  git commit -m "chore(data): 골프 한국 선수 성적·세계랭킹 자동 갱신 (mac-mini)" -q
  if ! git_push_with_retry; then
    log "❌ push 최종 실패 — 커밋은 로컬에 보존됨. 다음 실행의 reset 전에 회수 필요"
    exit 1
  fi
  log "✓ push 완료: $(git log --oneline -1)"
fi
log "✓ 종료"
