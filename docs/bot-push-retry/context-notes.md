# 컨텍스트 노트 — 봇 push 재시도

## 왜 이 일이 생겼나 (2026-08-18 규명)

`daily-golf-korea` 가 8/17·8/18 이틀 연속 데이터를 만들고도 push 거부로 버렸다.
`origin/main` 의 골프 데이터 최신 커밋은 `f2bcf6b` (8/16 09:00) 에 멈춰 있다.

충돌 쌍이 확정됐다.

| 잡 | 머신 | 스케줄 | 실제 KST |
|---|---|---|---|
| `daily-golf-korea` | 맥미니 (TZ KST) | launchd 09:00 | **09:00** |
| `cron-wc-xi.sh` | 맥북 (TZ **+07**) | crontab `0 7` | **09:00** |

맥북 TZ 가 UTC+7 이라 crontab 07:00 이 실제로는 KST 09:00 이다. 두 잡이 같은 분에 push 한다.
8/13~8/16 이 무사했던 건 wc-xi 쪽에 변경이 없어 push 를 건너뛴 날들이었기 때문이다.

## 왜 wc-xi 는 살아남고 골프만 지나

`cron-wc-xi.sh` 는 **2026-08-15 에 같은 [rejected] 를 겪고 이미 고쳐졌다** — `git fetch` 후
`rebase origin/main`(autoStash) 을 넣었다. 그 패턴을 맥미니 봇 4종에 옮기는 것이 이번 작업이다.
즉 해법은 새로 발명한 것이 아니라 **이 repo 안에 이미 검증된 것을 전파**하는 것이다.

## 전수 스캔 결과 — 4종이 동일 취약

`set -e` + 상단 `git fetch && git reset --hard origin/main` + 말미 **단발** `git push origin main -q`.
push 가 거부되면 `set -e` 로 즉사하고, 다음 실행의 `reset --hard` 가 커밋을 지운다.

| 봇 | 스케줄(KST) | rejected 실측 |
|---|---|---|
| `daily-golf-korea` | 매일 09:00 | **4회** (성공 5) |
| `daily-fifa-rankings` | 매일 06:40 | 0 |
| `daily-ts-team-mapping` | 매일 06:20 | 0 |
| `weekly-static-refresh` | 일 05:30 | 0 |

나머지 3종의 0회는 **구조적 안전이 아니라 시각이 안 겹친 운**이다. 코드는 골프와 같다.

## 설계 판단

1. **공용 라이브러리로 뽑았다** (`git-push-lib.sh`). 4곳에 같은 블록을 복붙하면 다음 수정 때 또 4곳을 고쳐야 한다.
   `hb-lib.sh` 에 넣지 않은 이유 — 그 파일은 봇 29개가 전부 source 하므로, 건드리면 폭발 반경이 전체가 된다.
2. **`reset --hard` 가 아니라 `rebase` 로 재시도한다.** reset 은 방금 만든 커밋을 지운다.
   rebase 는 남의 커밋 위에 내 커밋을 얹으므로 산출물이 보존된다.
3. **rebase 충돌 시 `--abort` 후 즉시 중단한다.** 자동 해소를 시도하면 데이터 파일이 뭉개진다.
   커밋은 로컬에 남으므로 다음 실행의 `reset --hard` 전까지는 회수 가능하다.
4. **재시도 3회 · 간격 10초.** 경합 상대(wc-xi)의 push 는 초 단위로 끝나므로 길게 기다릴 이유가 없다.
5. **최종 실패는 `exit 1`.** 조용히 성공으로 끝내면 heartbeat 가 정상으로 보고돼 오늘 같은 무성 유실이 반복된다.

## 손대지 않은 것

- `weekly-player-names.sh` — 맥미니에만 존재. repo 에 없어 커밋 대상이 아니다. 편입 여부는 사용자 판단.
- `scripts/cron-wc-xi.sh` — 이미 재시도 보유 + 미추적 파일.
- `hb-lib.sh` 및 나머지 봇 25종 — push 를 하지 않는다.
