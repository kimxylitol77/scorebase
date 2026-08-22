#!/bin/zsh
# data/*.json 자동 push 봇이 push 경합(non-fast-forward)에 밀렸을 때 산출물을 버리지 않게 하는 공용 함수.
#
# 배경 — 맥미니 봇들은 상단에서 `git reset --hard origin/main` 으로 tip 을 고정한 뒤 일을 하고
# 말미에 push 한다. 그 사이 다른 머신의 잡이 먼저 push 하면 tip 이 뒤처져 거부되고,
# `set -e` 때문에 스크립트가 즉사해 그날치 데이터가 통째로 사라진다.
# (2026-08-17·18 daily-golf-korea 이틀 연속 유실. 마지막 반영이 8/16 에 멈춰 있었다.)
#
# 해법은 scripts/cron-wc-xi.sh 가 2026-08-15 에 이미 검증한 패턴이다 — reset 이 아니라 rebase 로
# 남의 커밋 위에 내 커밋을 얹고 다시 push 한다.
#
# 사용법 (커밋을 만든 뒤 호출한다):
#   source "$HOME/dev/scorebase/mac-mini-worker/git-push-lib.sh"
#   if ! git_push_with_retry; then
#     log "❌ push 최종 실패 — 커밋은 로컬 보존"
#     exit 1
#   fi

# 최대 3회 시도. 실패하면 fetch → rebase 로 origin 위에 얹고 재시도한다.
# 성공 0 / 최종 실패 1. 실패해도 커밋은 로컬에 남는다.
#
# 인자로 refspec 을 줄 수 있다(기본 main). 브랜치가 main 이 아닐 수 있는 곳 —
# 예를 들어 Vultr 처럼 clone 상태를 장담 못 하는 워커 — 는 `HEAD:main` 을 넘긴다.
git_push_with_retry() {
  local refspec="${1:-main}"
  local attempt
  for attempt in 1 2 3; do
    if git push origin "$refspec" -q; then
      return 0
    fi

    echo "  push 거부 (시도 ${attempt}/3) — origin 이 먼저 움직인 것으로 추정"
    if [ "$attempt" -eq 3 ]; then
      break
    fi

    sleep 10
    if ! git fetch origin main -q; then
      echo "  fetch 실패 — 재시도"
      continue
    fi

    # rebase 충돌은 자동 해소하지 않는다. 데이터 파일을 뭉개는 것보다 중단이 낫다.
    if ! git -c rebase.autoStash=true rebase origin/main -q; then
      git rebase --abort 2>/dev/null || true
      echo "  ❌ rebase 충돌 — 자동 해소하지 않고 중단한다"
      return 1
    fi
  done

  return 1
}
