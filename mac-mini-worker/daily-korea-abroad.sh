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
# 안전선: ① data/korea-abroad.json 만 add (코드 절대 미포함) ② 빈 파일 가드 ③ 출전 기록 급감 가드 ④ 실패 시 push 안 함.
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
# ⚠ 크기 검증은 wc 로 한다 — `stat -f%z` 는 BSD(맥) 전용이라 리눅스에서 실패하고
#   `|| echo 0` 에 걸려 **항상 0B** 로 읽힌다. 그러면 이 가드가 매번 트립해
#   산출물이 조용히 커밋되지 않는다 (2026-09-05 Vultr 이전 후 실측: 히트맵 4주치 유실).
SIZE=$( { wc -c < data/korea-abroad.json 2>/dev/null || echo 0; } | tr -d "[:space:]" )
if [ "$SIZE" -lt 10000 ]; then
  echo "❌ data/korea-abroad.json 비정상 (${SIZE}B) — push 중단"
  git checkout -- data/ 2>/dev/null || true
  exit 1
fi
STAT_SIZE=$( { wc -c < data/player-season-stats.json 2>/dev/null || echo 0; } | tr -d "[:space:]" )
if [ "$STAT_SIZE" -lt 1000000 ]; then
  echo "❌ data/player-season-stats.json 비정상 (${STAT_SIZE}B) — push 중단"
  git checkout -- data/ 2>/dev/null || true
  exit 1
fi

# 의미 가드 — 위 크기 가드는 "값만 null 로 바뀌는" 오염을 못 잡는다(2026-08-24 8f2d9a3 ·
#   08-25 1a2ac41: ts IP 차단으로 전 리그 실패했는데 파일 크기는 거의 그대로라 통과했다).
#   status:"played" 건수를 직전 커밋과 비교한다. 스크립트 단 가드(156e1da 전멸 가드 + 소스 전면
#   실패 가드)는 "0명" 절벽만 잡는다 — 일부 리그만 빈 결과(code=0, results=[])를 주는 부분 붕괴
#   (19→5 등)와 다른 잡·수동 편집이 data/ 를 망가뜨리는 경우는 이 파일 기준 가드만 잡는다.
#   실측 근거 — 현재 시즌 기록 도입(508f945, 08-18) 이후 정상 커밋 10개의 played 는
#   18·18·19·19·19·19·19·19·19·19 로 일간 변동 최대 1, 오염 커밋 2건은 0 이었다
#   (2026-08-27 재측정 — 프록시 전환 후 08-27 07:20 9c66ba8 도 19 로 정상).
#   임계를 "직전의 절반 미만"으로 두면 19 기준 9 이하에서만 걸려 정상 변동(±1)과 겹치지 않는다.
played_count() {
  node -e 'let s="";process.stdin.on("data",(d)=>{s+=d}).on("end",()=>{try{const j=JSON.parse(s);console.log((j.players||[]).filter((p)=>p&&p.current&&p.current.status==="played").length)}catch(e){console.log(-1)}})'
}
PLAYED_NOW=$(played_count < data/korea-abroad.json)
PLAYED_HEAD=$(git show HEAD:data/korea-abroad.json | played_count)
if [ "$PLAYED_NOW" -lt 0 ]; then
  echo "❌ data/korea-abroad.json 파싱 불가 — push 중단"
  git checkout -- data/ 2>/dev/null || true
  exit 1
fi
if [ "$PLAYED_HEAD" -gt 0 ] && [ $((PLAYED_NOW * 2)) -lt "$PLAYED_HEAD" ]; then
  echo "❌ 해외파 출전 기록 급감 (HEAD ${PLAYED_HEAD}명 → ${PLAYED_NOW}명) — ts 조회 실패 의심, push 중단"
  git checkout -- data/ 2>/dev/null || true
  exit 1
fi
log "출전 기록 ${PLAYED_HEAD} → ${PLAYED_NOW}명 (의미 가드 통과)"

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
