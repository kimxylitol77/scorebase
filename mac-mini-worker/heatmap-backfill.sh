#!/bin/zsh
# heartbeat v2 — 성공/실패+에러를 EXIT 에서 자동 보고 (hb-lib.sh)
source "$HOME/dev/scorebase/mac-mini-worker/hb-lib.sh"
hb_trap mac-mini-heatmap-backfill /tmp/heatmap-backfill.log
# TheStatsAPI 히트맵 수집 — 빅5 26/27 (매주 토 01:00 KST, launchd).
# 전 단계 멱등이라 매주 같은 명령을 돌리면 결손분만 이어서 채운다.
#
# 시즌 정책 — **현재 시즌(26/27)만 돈다.**
#   지난 시즌(EPL·SERIE_A 25/26 / LALIGA·LIGUE_1 24/25) 백필은 2026-08-24 실행으로 끝냈다.
#   매핑은 선수당 시즌이 하나뿐이라, 과거 시즌 패스를 같이 두면 매주 앞뒤로 갈아타며
#   시즌 카드를 두 번 재빌드한다(610명 × 2 × 6s ≈ 2시간 헛일). 그래서 뺐다.
#   과거 시즌을 다시 채워야 하면 수동으로:
#     bash scripts/run-thestatsapi-pipeline.sh LIGUE_1 200 24/25
#   ⚠ 리그별로 제공 시즌이 다르다 (2026-08-25 실측) — 26/27 은 EPL·SERIE_A·LALIGA·LIGUE_1 이
#   200, 분데스는 개막 전이라 404(경기 4건 전부 scheduled). 개막하면 자동으로 붙는다.
#   라리가는 25/26 만 404 이고 24/25·26/27 은 정상이라는 기벽이 있다.
#
# ⚠ 이 스크립트는 git reset 을 하지 않는다. 몇 시간짜리라 다른 봇의 reset 과 겹치면
#   워킹트리 진행분이 통째로 날아가기 때문. 대신 보존을 두 겹으로 둔다.
#   ① 실행 중 10분마다 heatmap-commit-data.sh — origin/main 위에 plumbing 커밋으로 직접 push.
#      워킹트리·로컬 HEAD 를 안 건드려 수집 프로세스와 경합하지 않는다.
#   ② 종료 후 마지막 1회 + 종료코드 판정.
#
# 2026-08-16 사고 — 예전 꼬리는 `git pull --rebase && git push` 뒤에 `git log -1` 을 그대로
#   찍어, 리베이스가 충돌로 죽어도 "✓ push 완료"로 보고했다. 마지막 커밋이 통째로 사라졌고
#   (리그1 24/25 2명 유실) 로그만 성공이었다. 이제 종료코드로 판정하고 실패면 봇이 운다.
set -e          # hb-lib 전제 — set -e 없이 쓰면 용인된 실패에 ERR 가 조기 발사된다
set -o pipefail
cd ~/dev/scorebase
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:$PATH"
if [ -f mac-mini-worker/.env ]; then set -a; . mac-mini-worker/.env; set +a; fi
# 이 맥의 IPv6 경로가 thestatsapi(Cloudflare)로 안 붙는다 — 1차 실행이 EHOSTUNREACH 로 죽었다.
export NODE_OPTIONS="--dns-result-order=ipv4first"

log() { echo "[heatmap-backfill $(date '+%F %T')] $1"; }
SAVE=mac-mini-worker/heatmap-commit-data.sh
log "▶ 시작"

# ── 중간 보존 루프 (10분 주기). 어떻게 죽든 EXIT 에서 같이 정리한다.
#    루프 안 실패는 삼킨다 — 중간 저장 한 번 걸렀다고 수집을 죽일 이유가 없다.
while true; do sleep 600; { zsh "$SAVE" 2>&1 | sed 's/^/  [중간저장] /'; } || true; done &
SAVER_PID=$!
trap 'kill $SAVER_PID 2>/dev/null || true' EXIT INT TERM

# ── 리그별 재시도 — 이 맥은 네트워크가 간헐적으로 끊긴다 (2026-08-26 실측: 02:48·03:47
#    두 차례. thestatsapi 는 TLS DEPTH_ZERO_SELF_SIGNED_CERT, github 는 Network is unreachable).
#    스크립트 안 API 재시도(4회·수초)로는 못 넘기는 길이라 리그 단위로 크게 물러섰다 재시도한다.
#    한 번 끊기면 그 뒤 리그가 줄줄이 즉사해 실행 전체가 헛돈다 — 8/26 26/27 첫 실행이 그랬다.
run_league() {
  local lg=$1 attempt
  for attempt in 1 2 3; do
    if bash scripts/run-thestatsapi-pipeline.sh "$lg" 200 26/27; then return 0; fi
    if [ "$attempt" -lt 3 ]; then
      log "$lg 실패 (시도 $attempt/3) — 5분 뒤 재시도"
      sleep 300
    fi
  done
  log "$lg 3회 연속 실패 — 이번 회차는 건너뛴다"
  return 1
}

# 빅5 + 히트맵이 실제로 나오는 하위리그 3개 (2026-08-28 전수 확인).
# 하위 3개는 PlayerMarketValue 가 비어 있어 discover 가 팀 스쿼드로 유니버스를 만든다
# (SPL 25 · BUNDESLIGA_2 92 · SERIE_B 90명 — 200 상한에 안 걸린다).
FAILED=()
for LG in EPL SERIE_A LALIGA BUNDESLIGA LIGUE_1 SPL BUNDESLIGA_2 SERIE_B; do
  run_league "$LG" || FAILED+=("$LG")
done

# ── 2차 스윕 — 단절이 한 시간 넘게 이어진 적이 있다(8/26 11:28~12:20 Neon 불통으로 5개 리그
#    전부 3/3 실패). 리그 안 재시도(5분×3=15분)로는 못 넘는 길이라, 실패분만 30분 뒤 한 번 더.
if [ ${#FAILED[@]} -gt 0 ]; then
  log "1차에서 실패: ${FAILED[*]} — 30분 뒤 2차 스윕"
  sleep 1800
  for LG in "${FAILED[@]}"; do
    run_league "$LG" || log "$LG 2차도 실패 — 다음 주까지 대기"
  done
fi

# 시즌 활동 카드 재수집 — 진행 중인 시즌은 매주 누적치가 달라진다. 파이프라인 안의 카드 단계는
# "같은 시즌이면 skip" 이라 첫 주 이후로는 굳어버린다. 주 1회 전원 재수집(610명 ≈ 1시간).
# 데이터 0건이면 기존 카드를 덮지 않으므로, 개막 전 리그는 지난 시즌 카드가 그대로 남는다.
for attempt in 1 2; do
  if npx tsx --env-file=.env.local scripts/build-player-season-heatmaps.ts --refresh 2>&1 | tail -3; then break; fi
  log "시즌카드 재수집 실패 (시도 $attempt/2)"
  [ "$attempt" -eq 1 ] && sleep 300
done

kill $SAVER_PID 2>/dev/null || true

# ── 최종 보존 — 종료코드로 판정 (0 성공·변경없음 / 2 무결성 skip / 그 외 실패)
# rc=3 은 git fetch 실패 = 네트워크. 수집분이 origin 에 없다는 뜻이라 물러섰다 다시 민다.
RC=0
for attempt in 1 2 3; do
  RC=0
  zsh "$SAVE" || RC=$?
  if [ "$RC" -ne 3 ]; then break; fi
  log "최종 저장 fetch 실패 (시도 $attempt/3) — 3분 뒤 재시도"
  sleep 180
done
case $RC in
  0) log "✓ 최종 저장 완료" ;;
  2) log "⚠ 데이터 파일 무결성 미달 — 저장 건너뜀"; exit 1 ;;
  *) log "❌ 최종 저장 실패 (rc=$RC) — 수집분이 origin 에 없다. 재실행 필요"; exit 1 ;;
esac
log "✓ 종료"
