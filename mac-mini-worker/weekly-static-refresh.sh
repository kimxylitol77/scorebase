#!/bin/zsh
# heartbeat v2 — 성공/실패+에러를 EXIT 에서 자동 보고 (hb-lib.sh)
source "$HOME/dev/scorebase/mac-mini-worker/hb-lib.sh"
source "$HOME/dev/scorebase/mac-mini-worker/git-push-lib.sh"  # git_push_with_retry — push 경합 시 rebase 재시도
hb_trap mac-mini-weekly-static-refresh /tmp/weekly-static-refresh.log
# 매주 일요일 05:00 KST — /transfers·감독 페이지 정적 데이터 일괄 갱신 + data/*.json 한정 자동 push.
# 수동 재실행에 의존하던 빌더들(스쿼드·감독·경력·트로피·국기·포지션·이적 팀사전)을 자동화 (2026-06-11).
# 안전선: ① data/*.json 만 add (코드 절대 미포함) ② 핵심 json 빈 파일 가드 ③ 실패 시 push 안 함.
# 이 머신 IP = TheSports whitelist (빌더들의 ts API 호출 가능).
set -e
set -o pipefail
cd ~/dev/scorebase
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:$PATH"
if [ -f mac-mini-worker/.env ]; then set -a; . mac-mini-worker/.env; set +a; fi

log() { echo "[static-refresh $(date '+%F %T')] $1"; }
log "▶ 시작"

# repo 최신화 — 빌더 코드/사전 최신 기준
git fetch origin main -q && git reset --hard origin/main -q
npx --yes prisma generate >/dev/null 2>&1 || true

# ── 빌더 일괄 (실패 1개가 전체를 막지 않게 || true — 단 가드에서 빈 파일이면 중단) ──
log "① 이적 팀 사전"
npx tsx --env-file=.env.local scripts/build-transfer-league-teams.ts 2>&1 | tail -1 || true
log "② 공식 스쿼드·등번호"
npx tsx --env-file=.env.local scripts/build-team-squads.ts 2>&1 | tail -2 || true
log "③ 감독 스냅샷 (Haiku 한글명)"
env -u ANTHROPIC_API_KEY zsh -c 'set -a; . mac-mini-worker/.env; set +a; npx tsx scripts/build-team-coaches.ts' 2>&1 | tail -2 || true
log "③-b 전 리그 감독 (Team.coach + coach-photos.json — 라인업 감독 줄. 라인업 등장 감독은 팀 매핑 없어도 포함)"
npx tsx --env-file=.env.local scripts/collect-all-team-coaches.ts 2>&1 | tail -2 || true
log "③-c 감독 한글명 (Haiku, 멱등 — 신규분만)"
env -u ANTHROPIC_API_KEY zsh -c 'set -a; . mac-mini-worker/.env; set +a; npx tsx scripts/translate-coach-names.ts' 2>&1 | tail -1 || true
log "③-d 비축구 감독 (MLB=Stats API·NBA/WNBA/NHL=ESPN 자동, KBO/NPB/KBL/WKBL=사전 — 사전 교체는 수동)"
env -u ANTHROPIC_API_KEY zsh -c 'set -a; . mac-mini-worker/.env; set +a; npx tsx scripts/build-nonsoccer-coaches.ts' 2>&1 | tail -2 || true
log "④ 감독 경력 (Wikidata)"
npx tsx --env-file=.env.local scripts/build-coach-careers.ts 2>&1 | tail -1 || true
log "⑤ 감독 트로피 (위키 Honours)"
npx tsx --env-file=.env.local scripts/build-coach-honors.ts 2>&1 | tail -1 || true
log "⑥ 국기·국적 (130시즌)"
npx tsx --env-file=.env.local scripts/build-player-flags.ts 2>&1 | tail -1 || true
log "⑦ api-football 그리드 포지션 (빅5·UCL·WC — 스타 포괄 커버리지)"
npx tsx --env-file=.env.local scripts/build-player-positions.ts 2>&1 | tail -2 || true
log "⑦-b 세부 포지션 (라인업 x/y 최빈 + af그리드 우선 병합)"
npx tsx --env-file=.env.local scripts/derive-detail-position.ts 2>&1 | tail -2 || true
log "⑦-c 주발·계약만료 (ts preferred_foot — 미보유 선수만 단건 보충. 전수 재수집은 --from 1 수동)"
npx tsx --env-file=.env.local scripts/collect-player-foot-thesports.ts --missing 2>&1 | tail -2 || true
log "⑦-d 최근 이적자 계약만료 재조회 (--missing 은 결손만 채워 이적 후 옛 계약이 영구 잔존 — 로드리 실측)"
npx tsx --env-file=.env.local scripts/collect-player-foot-thesports.ts --recent-transfers 2>&1 | tail -2 || true
log "⑦-e 주급/연봉 (Capology 5대리그 — 리그당 1요청. 무스케줄이라 7/15 이후 동결이었음)"
npx tsx --env-file=.env.local scripts/fetch-football-wages.ts 2>&1 | tail -2 || true
log "⑧ 선수 ts↔af 매핑 + af 시즌스탯 (17개 리그 — 대회별·시즌별 스탯 섹션 동력)"
npx tsx --env-file=.env.local scripts/build-ts-af-player-map.ts 2>&1 | tail -3 || true
log "⑧-b 해외파 한국 선수 로스터 (af 국적 스캔 23개 리그 — /soccer/korea 동력, ~800콜)"
npx tsx --env-file=.env.local scripts/build-korea-abroad.ts 2>&1 | tail -3 || true
npx tsx --env-file=.env.local scripts/link-korea-abroad-players.ts 2>&1 | tail -3 || true
npx tsx --env-file=.env.local scripts/apply-korea-abroad-stats.ts 2>&1 | tail -2 || true
npx tsx --env-file=.env.local scripts/collect-korea-abroad-match-logs.ts --days=10 2>&1 | tail -2 || true
npx tsx --env-file=.env.local scripts/collect-korea-abroad-positions.ts --recent=20 2>&1 | tail -3 || true
# 해외파 grid 가 afgrid 에 병합된 뒤라 detail 을 다시 도출한다(⑦-b 는 해외파 수집 전에 돈다)
npx tsx --env-file=.env.local scripts/derive-detail-position.ts 2>&1 | tail -2 || true

# ⑧ 이 tsToAf 를 새로 쓴 뒤라야 한다 — 유령 쪽에만 붙은 af 매핑을 정본에 상속하며 같은 파일을 갱신한다.
log "⑧-c 유령(중복) 선수 페이지 → 정본 리다이렉트 맵 (ts id 여러 개 부여로 생긴 옛 페이지 정리)"
npx tsx --env-file=.env.local scripts/build-player-canonical-map.ts 2>&1 | tail -3 || true

log "⑨ NBA 부상자 한글명 (Haiku, BDL+ESPN union — 비스타 선수 보강)"
env -u ANTHROPIC_API_KEY zsh -c 'set -a; . mac-mini-worker/.env; set +a; npx tsx scripts/build-nba-player-names-haiku.ts' 2>&1 | tail -2 || true
log "⑩ MLB 부상자(IL) 한글명 (Haiku, BDL+ESPN union — 박스스코어 미수집 IL 선수 보강)"
env -u ANTHROPIC_API_KEY zsh -c 'set -a; . mac-mini-worker/.env; set +a; npx tsx scripts/build-mlb-injury-names-haiku.ts' 2>&1 | tail -2 || true
log "⑪ NHL 선수 한글명 (Haiku, NHL 매치 cache player_id → TheSports 영문 — 골타임라인·박스스코어)"
env -u ANTHROPIC_API_KEY zsh -c 'set -a; . mac-mini-worker/.env; set +a; npx tsx scripts/build-nhl-player-names-haiku.ts' 2>&1 | tail -2 || true
log "⑫ NHL 부상자 한글명 (Haiku, ESPN injuries — /injuries/NHL)"
env -u ANTHROPIC_API_KEY zsh -c 'set -a; . mac-mini-worker/.env; set +a; npx tsx scripts/build-nhl-injury-names-haiku.ts' 2>&1 | tail -2 || true
log "⑬ KBO·NPB 로스터 (koreabaseball·npb scrape — 支配下 1군)"
npx tsx --env-file=.env.local scripts/build-baseball-rosters.ts 2>&1 | tail -2 || true
# ⑬-b~d 는 ⑬ 이 새로 넣은 선수를 한글·사진으로 채운다. 로스터만 갱신되고 이 셋이 빠져 있어
#   1군 승격 선수가 팀 페이지에 한자 원문으로 나갔다 (2026-08-02 NPB 14명 실측). 순서 고정 —
#   카나 수집이 외국인 원명(⑬-c)의 입력이다.
log "⑬-b NPB 카나 사전 (npb.jp 상세 — 로스터 한자→한글 음역의 원천)"
npx tsx --env-file=.env.local scripts/build-npb-player-link.ts 2>&1 | tail -2 || true
log "⑬-c NPB 외국인 선수 한글명 (Haiku, 카나 병기 영문 원명)"
env -u ANTHROPIC_API_KEY zsh -c 'set -a; . mac-mini-worker/.env; set +a; npx tsx scripts/build-npb-foreign-names-haiku.ts' 2>&1 | tail -2 || true
log "⑬-d NPB 로스터 사진 (npb.jp 상세 — pid 로 URL 조립 불가라 사전 필수)"
npx tsx --env-file=.env.local scripts/build-npb-roster-photos.ts 2>&1 | tail -2 || true
log "⑬-e 야구 스쿼드 포지션·등번호 (ts squad/list — KBO·NPB position 결손 채움, DB 직갱신)"
npx tsx --env-file=.env.local scripts/sync-baseball-squads.ts 2>&1 | tail -2 || true
log "⑭ NBA 선수 인덱스·로스터 (ESPN 30팀 로스터 → nba-players.json — 팀페이지 로스터·트랜잭션 한글명·사진. ⑨ 이름사전 뒤 실행 필수)"
env -u ANTHROPIC_API_KEY zsh -c 'set -a; . mac-mini-worker/.env; set +a; npx tsx scripts/build-nba-players.ts' 2>&1 | tail -2 || true
log "⑭-b NBA TheSports 프로필 보강 (연봉·생일·키·몸무게·세부포지션 — ⑭ 재빌드 뒤 재병합 필수)"
npx tsx --env-file=.env.local scripts/enrich-nba-players-thesports.ts 2>&1 | tail -2 || true
log "⑮ 테니스 선수 한글명 (ATP·WTA top150 — 위키 ko → 미확보분 Haiku. /rankings/tennis)"
env -u ANTHROPIC_API_KEY zsh -c 'set -a; . mac-mini-worker/.env; set +a; npx tsx scripts/build-tennis-player-names.ts' 2>&1 | tail -2 || true
log "⑯ F1 드라이버 한글명 (시즌 22명 — 위키 ko → 미확보분 Haiku. /rankings/f1)"
env -u ANTHROPIC_API_KEY zsh -c 'set -a; . mac-mini-worker/.env; set +a; npx tsx scripts/build-f1-driver-names.ts' 2>&1 | tail -2 || true
# 골프 한국 선수 집계는 daily-golf-korea.sh(매일 09:00)로 분리 — 대회가 KST 월요일 종료라 주간으론 최대 6일 지연.

# ── 빈 파일 가드 — 핵심 json 이 비정상으로 작아지면 push 중단 ──
for f in data/team-squads.json data/team-coaches.json data/nonsoccer-coaches.json data/player-overrides.json data/player-positions.json data/ts-af-player-map.json data/player-season-stats.json data/af-player-season-stats.json data/baseball-rosters.json data/nba-players.json data/golf-korea-season.json data/korea-abroad.json data/player-foot.json data/player-contract.json data/football-wages.json; do
  SIZE=$(stat -f%z "$f" 2>/dev/null || echo 0)
  if [ "$SIZE" -lt 10000 ]; then
    echo "❌ $f 비정상 (${SIZE}B) — push 중단"
    git checkout -- data/ 2>/dev/null || true
    exit 1
  fi
done

# 유령 리다이렉트 맵은 위 목록보다 훨씬 작다(230건 ≈ 8KB) — 10KB 임계에 걸리므로 별도 가드.
# 비면 유령 페이지가 다시 노출될 뿐 사이트는 정상이나, 조용히 0건이 되는 건 막는다.
CANON_SIZE=$(stat -f%z data/player-canonical-redirects.json 2>/dev/null || echo 0)
if [ "$CANON_SIZE" -lt 1000 ]; then
  echo "❌ data/player-canonical-redirects.json 비정상 (${CANON_SIZE}B) — push 중단"
  git checkout -- data/ 2>/dev/null || true
  exit 1
fi

# ── data/*.json 변경분만 commit/push ──
if git diff --quiet -- data/; then
  log "변경 없음 — push 생략"
else
  git add data/*.json
  git commit -m "chore(data): 주간 정적 데이터 자동 갱신 — 스쿼드·감독·국기·포지션·선수매핑·시즌스탯 (mac-mini)" -q
  if ! git_push_with_retry; then
    log "❌ push 최종 실패 — 커밋은 로컬에 보존됨. 다음 실행의 reset 전에 회수 필요"
    exit 1
  fi
  log "✓ push 완료: $(git log --oneline -1)"
fi
log "✓ 종료"
