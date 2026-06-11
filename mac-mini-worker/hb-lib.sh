# hb-lib.sh — 스케줄 봇 공용 heartbeat v2 (source 해서 사용. zsh/bash 호환)
#
# 목적: "실행됐지만 실패"가 무감지로 지속되는 사고 방지 (daily-official-korean 2026-06-11).
# 서버(/api/internal/bot-heartbeat)가 ok:false 수신 시 즉시 텔레그램 정밀 알림(1h dedup).
#
# 사용 ① trap 모드 — 기존 .sh 상단에 2줄 (set -e 와 함께):
#     source ~/dev/scorebase/mac-mini-worker/hb-lib.sh
#     hb_trap <bot-name> [로그파일]      # EXIT 시 rc==0 → ok:true, 아니면 ok:false+로그 꼬리
#   (성공 보고를 trap 이 하므로 기존의 수동 heartbeat curl 은 제거해도 됨)
#
# 사용 ② run 모드 — 명령 단위 재시도 1회 내장:
#     hb_run <bot-name> -- <command...>
#
# 필요 env: SITE_URL(기본 scorebase.kr), INTERNAL_API_TOKEN

_hb_post() { # $1 name, $2 ok(true|false), $3 error, $4 durationMs
  # error 는 개행→공백, 쌍따옴표→홑따옴표, 역슬래시 제거로 JSON-safe 화 (380자 cap)
  local err payload
  err=$(printf '%s' "$3" | tr '\n' ' ' | tr '"' "'" | tr -d '\\' | cut -c1-380)
  payload=$(printf '{"name":"%s","ok":%s,"durationMs":%s,"error":"%s"}' \
    "$1" "$2" "${4:-0}" "$err")
  curl -sS -m 15 -X POST "${SITE_URL:-https://www.scorebase.kr}/api/internal/bot-heartbeat" \
    -H "Authorization: Bearer ${INTERNAL_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$payload" >/dev/null 2>&1 || true
}

hb_trap() {
  HB_NAME="$1"
  HB_LOG="${2:-}"
  HB_START=$(date +%s)
  trap '_hb_on_exit $?' EXIT
}

_hb_on_exit() {
  local rc=$1
  local dur=$(( ($(date +%s) - HB_START) * 1000 ))
  if [ "$rc" -eq 0 ]; then
    _hb_post "$HB_NAME" true "" "$dur"
  else
    local tail_txt="exit=$rc"
    if [ -n "$HB_LOG" ] && [ -f "$HB_LOG" ]; then
      tail_txt="exit=$rc | $(tail -c 300 "$HB_LOG" 2>/dev/null)"
    fi
    _hb_post "$HB_NAME" false "$tail_txt" "$dur"
  fi
}

hb_run() { # hb_run <name> -- <command...>
  local name="$1"; shift
  [ "$1" = "--" ] && shift
  local start=$(date +%s) out rc
  out=$("$@" 2>&1); rc=$?
  if [ $rc -ne 0 ]; then
    # 자가치유: 1회 재시도 (일시 네트워크/DB 순단 흡수)
    sleep 5
    out=$("$@" 2>&1); rc=$?
  fi
  local dur=$(( ($(date +%s) - start) * 1000 ))
  if [ $rc -eq 0 ]; then
    _hb_post "$name" true "" "$dur"
  else
    _hb_post "$name" false "exit=$rc | $(printf '%s' "$out" | tail -c 300)" "$dur"
  fi
  printf '%s\n' "$out"
  return $rc
}
