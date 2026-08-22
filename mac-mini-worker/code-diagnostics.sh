#!/bin/zsh
# heartbeat v2 — 성공/실패+에러를 EXIT 에서 자동 보고 (hb-lib.sh)
source "$HOME/dev/scorebase/mac-mini-worker/hb-lib.sh"
hb_trap mac-mini-code-diagnostics /tmp/code-diagnostics.log
# 매일 — Claude(Max OAuth) 감독관이 두 가지를 종합해 코드 건강을 텔레그램 보고:
#   (1) repo 정적 진단 — tsc·TODO·dead code (Claude 직접)
#   (2) 배포 변경 검수 — 방금 배포된 git diff + 변경 라우트 404 를 ChatGPT·Ollama 가 검수
# 정적 tsc 가 못 잡는 런타임 404(예: af id 를 ts id 자리에 넣어 /transfers/1100 404)를
# 외부 AI 2종이 배포 변경분에 좁혀 보강한다.
# ⚠️ 읽기전용 — allowedTools 에 Edit/Write/commit/push 없음 = 수정 자동 차단. 진단·제안만.
set -e
cd ~/dev/scorebase
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/node@22/bin:$PATH"
if [ -f mac-mini-worker/.env ]; then set -a; . mac-mini-worker/.env; set +a; fi

log() { echo "[code-diagnostics $(date '+%Y-%m-%d %H:%M:%S')] $1"; }
log "▶ 시작"
git fetch origin main -q && git reset --hard origin/main -q || true
# node_modules 를 최신 package.json 에 맞춘다 — 안 하면 새로 추가된 의존성이
# tsc "Cannot find module"(코드 결함 아닌 환경 문제)로 잘못 보고된다.
npm install --prefer-offline --no-audit --no-fund -s || true

# ── PHASE 1: 배포 변경 검수 (ChatGPT + Ollama) — 정적 tsc 가 못 잡는 런타임 404/회귀 ──
log "▶ 배포 변경 검수 (ChatGPT+Ollama)..."
DEPLOY_REVIEW=$(node mac-mini-worker/code-review-deploy.js 2>&1 || echo "(배포 검수 실행 실패)")
log "▶ 배포 검수 완료 (${#DEPLOY_REVIEW}자)"

# ── af id 오용 정적 검사 ──
# 2026-08-22 사고 재발 감시 — Match.externalId(EPL 은 football-data 대역)를 af fixture id 로
# 넘겨 라이브 중계·AI 예측·라운드·팀 시즌 통계가 통째로 남의 경기(독일 U19)가 됐다.
# 런타임 방어(afTeamsMatch)가 화면 노출은 막지만, 잘못 부르는 코드는 여기서 잡는다.
# set -e 에 걸리지 않게 rc 를 따로 받는다(위반이면 exit 1 이 정상 동작이다).
AF_ID_RC=0
AF_ID_CHECK=$(npx --yes tsx scripts/check-af-id-misuse.ts 2>&1) || AF_ID_RC=$?
log "▶ af id 오용 검사 rc=$AF_ID_RC"
if [ "$AF_ID_RC" != "0" ]; then
  DEPLOY_REVIEW="$DEPLOY_REVIEW

— af id 오용 검사 (위반) —
$AF_ID_CHECK"
fi

# ── PHASE 2: Claude(Max OAuth) 감독관 종합 ──
# Max 구독(OAuth) 사용 — ANTHROPIC_API_KEY 가 OAuth 를 이기므로 제거 (hermes /fix 패턴)
unset ANTHROPIC_API_KEY

SYSTEM="너는 scorebase 코드 건강 감독관이다. 읽기전용 진단만 — 절대 파일 Edit/Write/수정/commit/push 하지 마라. 직접 정적 진단을 하고, 아래 제공되는 ChatGPT·Ollama 의 배포 변경 검수 의견까지 종합해 한국어로 최종 판정만 해라. 수정이 필요하면 적용하지 말고 제안만 해라."
BASE_PROMPT=$(cat <<'PEOF'
scorebase repo 코드 건강을 진단하고, 아래 [배포 변경 검수] 까지 종합해 한국어로 12줄 이내 요약해라. 절대 파일을 수정하지 마라.
1) `npx tsc --noEmit` 실행 → 타입 에러 있으면 개수 + 대표 1~2개. 단 "Cannot find module"·"Could not find a declaration file" 류는 코드 결함이 아니라 빌드 환경(의존성) 문제다 — 코드 에러로 세지 말고 "환경" 으로 따로 적어라.
2) 최근 7일 커밋(git log) 기준 새로 생긴 TODO/FIXME/HACK 주석이나 임시(_ 접두) 스크립트 잔존 여부.
3) 확실한 dead code / 안 쓰는 export / 명백한 중복 후보 2~3개만 (추측 금지).
4) [배포 변경 검수] 의 404/회귀 지적 중 실제 위험만 선별 — "실제 위험" 으로 승격하기 전에 해당 파일을 Read 로 직접 확인해라. 이미 try/catch 로 감싼 readFileSync, git 에 commit 된 정적 데이터(data/*.json) 읽기, 추측성 지적은 위험이 아니다. 있으면 최우선으로 보고.
5) 종합 한 줄 — 특이사항 없으면 "특이사항 없음".
문제 없으면 짧게. 과한 추측·장문 금지.
PEOF
)
PROMPT="$BASE_PROMPT

[배포 변경 검수 — ChatGPT·Ollama 가 방금 배포된 변경을 검수한 결과. 실제 위험만 종합에 반영]
$DEPLOY_REVIEW"

log "▶ claude 감독관 종합 중..."
REPORT=$(claude -p "$PROMPT" \
  --allowedTools "Read,Grep,Glob,Bash(npx tsc:*),Bash(git log:*),Bash(git diff:*),Bash(git status:*),Bash(grep:*),Bash(rg:*),Bash(find:*),Bash(wc:*),Bash(ls:*),Bash(head:*),Bash(tail:*)" \
  --append-system-prompt "$SYSTEM" 2>&1 || true)
log "▶ 종합 완료 (${#REPORT}자)"
echo "----- REPORT -----"
echo "$REPORT"
echo "----- /REPORT -----"

# severity — 배포 검수에서 깨진 라우트(404/5xx) 감지되면 HIGH 로 승격
SEV="INFO"
TITLE="🔍 야간 코드 진단 (감독관 종합)"
if echo "$DEPLOY_REVIEW" | grep -q "깨진 라우트"; then SEV="HIGH"; TITLE="🚨 배포 변경 404 감지"; fi
# af id 오용은 화면에 남의 경기 데이터가 뜨는 사고라 즉시 HIGH.
if [ "$AF_ID_RC" != "0" ]; then SEV="HIGH"; TITLE="🚨 af id 오용 감지 (남의 경기 데이터 위험)"; fi

# 텔레그램 전송 + heartbeat (node 로 JSON 안전 인코딩)
SITE="${SITE_URL:-https://www.scorebase.kr}"
REPORT="$REPORT" DEPLOY="$DEPLOY_REVIEW" SITE="$SITE" TOKEN="$INTERNAL_API_TOKEN" SEV="$SEV" TITLE="$TITLE" node -e '
const rep=(process.env.REPORT||"(출력 없음)").trim();
const dep=(process.env.DEPLOY||"").trim();
const msg=(rep + (dep ? "\n\n— 배포 검수 원본 —\n"+dep : "")).slice(0,3500);
const h={Authorization:"Bearer "+process.env.TOKEN,"Content-Type":"application/json"};
fetch(process.env.SITE+"/api/internal/notify",{method:"POST",headers:h,body:JSON.stringify({source:"code-diagnostics",severity:process.env.SEV||"INFO",title:process.env.TITLE,message:msg})})
 .then(()=>fetch(process.env.SITE+"/api/internal/bot-heartbeat",{method:"POST",headers:h,body:JSON.stringify({bot:"code-diagnostics"})}))
 .then(()=>process.exit(0)).catch(()=>process.exit(0));
'
log "✓ 종료"
