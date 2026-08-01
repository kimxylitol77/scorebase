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

# 1회 발사 가드 — zshexit 과 ERR trap 이 같은 죽음에 겹쳐도 heartbeat 는 한 번만.
_hb_fire() {
  [ -n "$HB_SENT" ] && return 0
  HB_SENT=1
  _hb_on_exit "$1"
}

hb_trap() {
  HB_NAME="$1"
  HB_LOG="${2:-}"
  HB_START=$(date +%s)
  HB_SENT=""
  if [ -n "$ZSH_VERSION" ]; then
    # ⚠ zsh 는 함수 안에서 건 EXIT trap 을 쉘 종료가 아니라 "이 함수가 리턴할 때" 실행한다.
    #   그래서 .env 로드 전(토큰 없음) 헛발사 → 401 로 조용히 버려지고, 정작 스크립트 종료 땐
    #   아무것도 안 쐈다. 도입(06-11) 이후 셸 봇 전원의 heartbeat 행이 아예 없던 원인
    #   (2026-08-01 daily-ts-team-mapping 등록 중 발견 — 행이 없으니 감시 체커에도 안 보였다).
    #   두 경로로 커버한다 (실측: 서로 배타적이라 가드로 1회 보장).
    #     zshexit 훅  — 정상 종료·명시적 exit (정의 위치 무관하게 쉘 종료 시 실행)
    #     ERR trap    — set -e 죽음 (이때 zshexit 은 실행되지 않음. ERR 는 EXIT 와 달리
    #                   함수 안에서 걸어도 전역이다 — zsh 함수 스코프 특례는 EXIT/0 뿐)
    #   전제: hb_trap 사용 스크립트는 set -e (현재 6개 전부 확인). set -e 없이 쓰면
    #   용인된 실패(|| true 없이 그냥 지나가는 명령)에 ERR 가 조기 발사돼 성공 실행이
    #   실패로 기록된다 — 새 스크립트는 set -e 를 켜고 쓸 것.
    zshexit() { _hb_fire $?; }
    trap '_hb_fire $?' ERR
  else
    trap '_hb_fire $?' EXIT
  fi
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
