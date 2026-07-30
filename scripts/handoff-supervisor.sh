#!/usr/bin/env bash
# 감독자 루프 — 긴 작업을 세그먼트로 쪼개, 매 세그먼트를 0% 컨텍스트의 새 클로드 세션에서 돌린다.
# 클로드는 자기 대화를 스스로 비울 수 없다(/clear 는 사람이 누르는 명령). 그래서 밖에서 세션을 갈아준다.
# 세션 간 인계는 reports/handoff/current.md + SessionStart 훅(claude-hooks/handoff-restore.sh)이 담당한다.
#   사용: ./scripts/handoff-supervisor.sh <브리프파일> [최대세그먼트=4] [모델]
#   DRY=1 → 프롬프트만 출력하고 실제 실행은 생략
set -uo pipefail
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

REPO="/Users/kimss/scorebase"
DIR="$REPO/reports/handoff"
NOTE="$DIR/current.md"
BRIEF="${1:-}"
MAX="${2:-4}"
MODEL="${3:-}"

if [ -z "$BRIEF" ] || [ ! -f "$BRIEF" ]; then
  echo "사용: $0 <브리프파일> [최대세그먼트=4] [모델]"
  exit 1
fi
BRIEF="$(cd "$(dirname "$BRIEF")" && pwd)/$(basename "$BRIEF")"
mkdir -p "$DIR/segments" 2>/dev/null

RUN="$(date +%Y%m%d-%H%M%S)"
echo "▶ 감독자 시작 — 브리프 $BRIEF / 최대 ${MAX}세그먼트 / run $RUN"

# 비정상 종료만 알린다 (정상 완료 보고는 작업 자체가 한다)
notify() {
  local msg="$1"
  [ -f "$REPO/.env.local" ] || return 0
  local tok
  tok="$(grep -m1 '^INTERNAL_API_TOKEN=' "$REPO/.env.local" | cut -d= -f2- | tr -d '"'"'"' ')"
  [ -n "$tok" ] || return 0
  curl -s -X POST https://www.scorebase.kr/api/internal/notify \
    -H "Authorization: Bearer $tok" -H "Content-Type: application/json" \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"source":"handoff-supervisor","severity":"WARN","title":"감독자 루프 비정상 종료","message":sys.argv[1]}))' "$msg")" \
    >/dev/null 2>&1 || true
}

hash_note() { [ -f "$NOTE" ] && md5 -q "$NOTE" 2>/dev/null || echo "none"; }

seg=1
while [ "$seg" -le "$MAX" ]; do
  LOG="$DIR/segments/${RUN}-seg${seg}.log"
  BEFORE="$(hash_note)"
  PROMPT="지시서: ${BRIEF}
이 지시서를 읽고 수행하라. 이 실행은 세그먼트 ${seg}/${MAX} 다.

규칙.
- 이전 세그먼트가 남긴 인계 노트는 컨텍스트에 자동 주입된다. 주입된 게 있으면 그 지점부터 이어가고, 이미 끝난 일을 다시 하지 마라. 노트가 코드 상태와 다를 수 있으니 파일·git 을 먼저 확인하라.
- 한 세션에서 다 못 끝내면 ${NOTE} 에 (지금 단계 / 끝낸 것 / 다음 한 걸음 / 산출물 경로) 를 적고 멈춰라.
- 지시서의 일이 완전히 끝났으면 ${NOTE} 를 삭제하고 마지막 줄에 정확히 DONE 만 출력하라.
- 세그먼트가 마지막(${seg}==${MAX})이면 남은 일을 무리해서 밀어붙이지 말고, 인계 노트를 정확히 남기는 데 집중하라."

  if [ "${DRY:-0}" = "1" ]; then
    echo "--- DRY 세그먼트 ${seg} 프롬프트 ---"; echo "$PROMPT"; exit 0
  fi

  echo "  [${seg}/${MAX}] 새 세션 시작 (0% 컨텍스트) → $LOG"
  # acceptEdits — 무인 실행에서 파일 편집은 자동 승인, 셸 명령은 기존 허용 목록이 판정한다.
  # auto 모드는 승인 대기로 멈추고(실측), bypassPermissions 는 운영 DB·발행 권한까지 열려 쓰지 않는다.
  # shellcheck disable=SC2086
  ( cd "$REPO" && claude -p "$PROMPT" --permission-mode acceptEdits ${MODEL:+--model "$MODEL"} < /dev/null ) > "$LOG" 2>&1
  rc=$?
  tail -3 "$LOG" | sed 's/^/    | /'

  if [ "$rc" -ne 0 ]; then
    echo "  ✗ 세그먼트 ${seg} 종료코드 ${rc} — 중단"
    notify "세그먼트 ${seg}/${MAX} 실행 실패(코드 ${rc}). 로그: reports/handoff/segments/${RUN}-seg${seg}.log"
    exit 1
  fi

  # 완료 판정 — DONE 출력 또는 인계 노트 삭제
  if tail -5 "$LOG" | grep -qx "DONE" || [ ! -f "$NOTE" ]; then
    echo "✓ 완료 — 세그먼트 ${seg}개 사용"
    exit 0
  fi

  # 진전 없음 방어 — 노트가 그대로면 같은 자리를 돌고 있다
  if [ "$(hash_note)" = "$BEFORE" ]; then
    echo "  ✗ 인계 노트가 갱신되지 않았다 — 진전 없음으로 판단해 중단"
    notify "세그먼트 ${seg}/${MAX} 후 인계 노트 무변화(진전 없음). 로그: reports/handoff/segments/${RUN}-seg${seg}.log"
    exit 1
  fi

  seg=$((seg + 1))
done

echo "△ 세그먼트 상한 ${MAX} 도달 — 미완. 인계 노트는 ${NOTE} 에 남아 있다"
notify "세그먼트 상한 ${MAX} 도달로 미완 종료. 이어받기 노트: reports/handoff/current.md"
exit 2
