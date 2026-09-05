#!/bin/zsh
# 히트맵 백필 결과(data/*.json 3종)를 origin/main 위에 직접 커밋·푸시한다.
# 워킹트리와 로컬 HEAD 를 건드리지 않아 실행 중인 백필 프로세스와 경합하지 않는다.
# 맥미니 봇 12종이 수시로 git reset --hard origin/main 을 하므로, origin 에 올려두는 것이 유일한 보존책이다.
set -o pipefail
cd ~/dev/scorebase || exit 1
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:$PATH"

FILES=(data/thestatsapi-player-map.json data/player-heatmap-analysis.json data/player-match-heatmaps.json)

# 1) 무결성 — 증분 저장 도중일 수 있으니 깨진 파일은 이번 회차를 건너뛴다
for f in $FILES; do
  # ⚠ 크기 검증은 wc 로 한다 — `stat -f%z` 는 BSD(맥) 전용이라 리눅스에서 실패하고
  #   `|| echo 0` 에 걸려 **항상 0B** 로 읽힌다. 그러면 이 가드가 매번 트립해
  #   산출물이 조용히 커밋되지 않는다 (2026-09-05 Vultr 이전 후 실측: 히트맵 4주치 유실).
  SIZE=$( { wc -c < "$f" 2>/dev/null || echo 0; } | tr -d "[:space:]" )
  if [ "$SIZE" -lt 10000 ]; then echo "skip: $f 비정상 (${SIZE}B)"; exit 2; fi
  node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" 2>/dev/null || { echo "skip: $f 파싱 실패"; exit 2; }
done

git fetch origin main -q || { echo "skip: fetch 실패"; exit 3; }

# 2) origin 과 내용이 같으면 할 일 없음
CHANGED=0
for f in $FILES; do
  LOCAL=$(git hash-object "$f")
  REMOTE=$(git rev-parse "origin/main:$f" 2>/dev/null || echo none)
  [ "$LOCAL" != "$REMOTE" ] && CHANGED=1
done
[ "$CHANGED" = 0 ] && { echo "변경 없음"; exit 0; }

# 3) origin/main 을 부모로 한 커밋을 plumbing 으로 만들어 바로 push
IDX=/tmp/heatmap-index.$$
rm -f "$IDX"
export GIT_INDEX_FILE="$IDX"
git read-tree origin/main || { rm -f "$IDX"; exit 4; }
for f in $FILES; do
  SHA=$(git hash-object -w "$f") || { rm -f "$IDX"; exit 4; }
  git update-index --add --cacheinfo 100644,"$SHA","$f" || { rm -f "$IDX"; exit 4; }
done
TREE=$(git write-tree) || { rm -f "$IDX"; exit 4; }
rm -f "$IDX"
unset GIT_INDEX_FILE

COMMIT=$(git commit-tree "$TREE" -p origin/main -m "chore(data): 히트맵 백필 중간 저장 (mac-mini)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>") || exit 5
git push origin "$COMMIT:main" -q || { echo "push 실패 (다음 회차 재시도)"; exit 6; }
echo "push 완료 ${COMMIT:0:8}"
