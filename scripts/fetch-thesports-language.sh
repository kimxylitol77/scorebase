#!/bin/bash
# TheSports football language type=5 (선수 공식 한국어명) 전량 수집 → /tmp/lang-player-ko.jsonl.
# name_ko 비어있지 않은 것만 JSONL({id,ko}) 누적. worker(Lightsail, TheSports IP whitelist)에서 실행.
# mac mini 공식 한글 봇이 매일 새벽 worker 로 scp → 실행 → 결과 회수.
set -a; . /home/ubuntu/.env; set +a
OUT=/tmp/lang-player-ko.jsonl
: > "$OUT"
p=1
fails=0
while true; do
  resp=$(curl -s --max-time 30 "https://api.thesports.com/v1/football/language/list?type=5&page=$p&user=$THESPORTS_USER&secret=$THESPORTS_SECRET")
  n=$(echo "$resp" | jq '.results|length' 2>/dev/null)
  if [ -z "$n" ]; then
    fails=$((fails+1))
    echo "page=$p PARSE_FAIL ($fails)"
    if [ "$fails" -ge 5 ]; then echo "ABORT too many fails at page=$p"; break; fi
    sleep 3; continue
  fi
  fails=0
  echo "$resp" | jq -c '.results[] | select(.name_ko != null and .name_ko != "") | {id, ko: .name_ko}' >> "$OUT"
  if [ "$n" -lt 1000 ]; then break; fi
  p=$((p+1))
done
echo "DONE_MARKER pages=$p lines=$(wc -l < "$OUT")"
