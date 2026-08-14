#!/bin/bash
# TheStatsAPI 수집 파이프라인 — 발굴(몸값 상위 N, 팀 기반 자동 판별) → 시즌 카드 → 경기별 히트맵.
# 전 단계 멱등이라 반복 실행 안전. trial 분당 12회 페이싱 내장. 시즌 중 데일리 봇으로 그대로 사용 가능.
# 히트맵 미지원 리그는 시즌 단계에서 자연 감지돼 경기별 단계가 자동 스킵된다.
#   사용: THESTATSAPI_KEY=... bash scripts/run-thestatsapi-pipeline.sh [리그=EPL] [상위N=50] [시즌=25/26]
# 시즌: 25/26 히트맵은 EPL·SERIE_A 만 제공된다 (2026-08-14 실측). 나머지 3개 리그는 24/25 로 돌릴 것.
set -e
set -o pipefail
cd "$(dirname "$0")/.."
LEAGUE="${1:-EPL}"
N="${2:-50}"
SEASON="${3:-25/26}"
# 키는 쉘 export 또는 .env.local 어느 쪽이든 (하위 스크립트는 --env-file 로 읽지만 이 가드는 쉘 변수만 봤다)
if [ -z "$THESTATSAPI_KEY" ] && [ -f .env.local ]; then
  export THESTATSAPI_KEY=$(grep -m1 '^THESTATSAPI_KEY=' .env.local | cut -d= -f2- | tr -d '"'"'"'')
fi
if [ -z "$THESTATSAPI_KEY" ]; then echo "THESTATSAPI_KEY 필요 (.env.local 또는 export)"; exit 1; fi

echo "▶ 1/3 선수 매핑 발굴 ($LEAGUE 상위 $N · $SEASON)"
npx tsx --env-file=.env.local scripts/discover-thestatsapi-players.ts "$LEAGUE" "$N" "--season=$SEASON"
echo "▶ 2/3 시즌 활동 카드"
npx tsx --env-file=.env.local scripts/build-player-season-heatmaps.ts
echo "▶ 3/3 경기별 히트맵"
npx tsx --env-file=.env.local scripts/build-player-match-heatmaps.ts
echo "PIPELINE_DONE"
