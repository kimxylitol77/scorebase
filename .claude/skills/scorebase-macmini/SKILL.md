---
name: scorebase-macmini
description: 맥미니(scorebase-mimi) 봇 worker SSH 접속 + 봇 코드 배포·재시작 정형화. 사용자가 "맥미니 연결", "맥미니 접속", "맥미니 들어가", "워커 재시작", "봇 재시작", "맥미니 배포", "봇 코드 반영" 같은 요청을 하거나, preview-coverage·endpoint-monitor·data-sanity·live-scores-watcher·api-quota·stale-ts-verify·match-narrator 등 mac-mini-* 봇이 "응답 없음 / heartbeat N분 멈춤 / hang" 알림을 보냈을 때, 또는 mac-mini-worker/*.js 봇 코드를 수정한 뒤 맥미니에 반영해야 할 때 반드시 사용. 매번 헷갈리는 유저명(kkulkkul)·접속 주소·repo 경로·launchctl 문법을 고정하고, 흔한 실수(유저명 누락→연결거부, ssh mimi alias IP 변동→timeout)를 회피해 git 최신화→재시작→상태확인까지 한 번에.
---

# Scorebase 맥미니 봇 운영

맥미니(`scorebase-mimi`) = scorebase 봇 worker 머신(Apple Silicon, 계정 `kkulkkul`). SSH 접속·봇 배포·재시작이 자주 반복되는데, 매번 유저명/주소/경로/launchctl 문법을 헷갈려 시간 낭비하던 걸 정형화한다.

## 1. SSH 접속 — 올바른 한 줄

```bash
ssh kkulkkul@scorebase-mimi.local
```

로컬 랜선 직결(mDNS). 네트워크 sandbox 가 SSH 를 막으면 Bash 에 `dangerouslyDisableSandbox: true`.

⚠️ **흔한 실수 2가지 (둘 다 실제로 겪음):**
- **유저명 빼먹기** — `ssh scorebase-mimi.local`(기본 유저 kimss)로 붙으면 `"Connection closed"`(publickey 거부 후 닫힘). **키 문제 아니라 유저 불일치**. 반드시 `kkulkkul@`.
- **`ssh mimi` alias 의존** — `~/.ssh/config` 의 `mimi` HostName(169.254.138.190)은 link-local 이라 IP 가 변동 → `Operation timed out`. `kkulkkul@scorebase-mimi.local`(mDNS)이 항상 도달한다.

접속 안 되면 진단 순서:
1. `ping -c2 scorebase-mimi.local` — 랜선 도달성(보통 1~2ms).
2. 도달되는데 거부 → 유저명 `kkulkkul` 확인.
3. `ssh kkulkkul@scorebase-mimi.local "whoami; hostname"` — 성공 확인.

## 2. 봇 코드 배포 (mac-mini-worker/*.js 수정 후)

- 맥미니 repo = `/Users/kkulkkul/dev/scorebase` (origin = `github.com/kimxylitol77/scorebase`). 봇은 `mac-mini-worker/` 안.
- 이 맥북 repo = `/Users/kimss/scorebase` — 여기서 수정 → commit·push → 맥미니가 fetch.
- **상주 프로세스는 옛 코드를 메모리에 유지** → git 최신화만으로는 반영 안 됨. **반드시 재시작(3단계)**.

이 맥북에서 수정·push 한 뒤, 맥미니에서 그 파일만 안전하게 최신화 (다른 로컬 변경 안 건드림):

```bash
ssh kkulkkul@scorebase-mimi.local "
cd ~/dev/scorebase
git fetch origin
git checkout origin/main -- mac-mini-worker/<파일>.js
grep -n '<바뀐 코드 일부>' mac-mini-worker/<파일>.js   # 반영 확인
"
```

`git pull` 보다 `git checkout origin/main -- <파일>` 이 안전 — 맥미니의 다른 untracked/로컬 변경(.env 등)을 안 건드린다.

## 3. 봇 재시작

plist = `~/Library/LaunchAgents/com.scorebase.<name>.plist`. label = `com.scorebase.<name>`.

```bash
ssh kkulkkul@scorebase-mimi.local "launchctl kickstart -k gui/\$(id -u)/com.scorebase.<name>"
```

- `-k` = 실행 중이면 kill 후 재시작. SSH 비대화형에서도 `gui/$(id -u)` 도메인 접근 OK.
- 봇 이름 모르면: `launchctl list | grep -i scorebase` (출력의 label 에서 `com.scorebase.` 뒤가 `<name>`).
- 흔한 label: `endpoint-monitor` `preview-coverage` `live-scores-watcher` `data-sanity` `api-quota` `stale-ts-verify` `match-narrator` `hermes-telegram-bot` `reverse-tunnel` `synthetic-monitor`.

## 4. 상태 확인

- **프로세스 살아있나 / hang 인가**:
  ```bash
  ssh kkulkkul@scorebase-mimi.local "ps -o pid,etime,command -ax | grep '[<n>]ame'"
  ```
  ⚠️ `etime` 이 길고(7일+) heartbeat 만 멈췄으면 **죽은 게 아니라 hang** — 재시작이 답. (launchd KeepAlive 는 프로세스가 살아있으면 hang 을 못 잡는다.)
- **재시작 성공**: kickstart 후 `launchctl list | grep <name>` → PID 가 바뀌고 exit code 0.
- **로그**: `tail /tmp/<name>.log` (plist stdout).

## 흔한 패턴

- **mac-mini-* 봇 "응답 없음 / heartbeat N분 멈춤"** = 대개 프로세스 hang(상주하다 멈춤). `ps etime` 으로 살아있는지 보고 → `kickstart -k`. 죽은 줄 알고 install.sh 돌리지 말 것.
- **봇 코드 수정·push 했는데 증상 그대로** = 맥미니에서 재시작 안 해서 옛 코드 메모리 유지. fetch + checkout + kickstart 세트 필수.
- **endpoint-monitor 복구 알림 떼로 옴** = 짧은 시간 연속 Vercel 배포의 콜드 스타트(단발 실패→복구). 봇 문제 아님 — 배포 멈추면 가라앉음.

## 절대 하지 말 것

- **scorebase-mimi.local 에 유저명 없이 접속** — 거부. 항상 `kkulkkul@`.
- **봇 1개 재시작에 install.sh 전체 재실행** — 다른 봇이 unload→load 된다. 해당 plist 만 `kickstart`.
- **`git pull` 로 맥미니 repo 통째 갱신** — 맥미니 로컬 변경(.env 등) 충돌 위험. 수정 파일만 `git checkout origin/main -- <파일>`.

## 참고

- 메모리 [[macmini-ssh-access]] — 접속·reverse-tunnel·24h 봇·heartbeat v2 상세.
- 봇 알림 진단(false positive 판별)은 [scorebase-triage] 스킬, 사이트 코드 배포는 [scorebase-deploy] 스킬과 역할 분담 — 이 스킬은 "맥미니 접속·봇 프로세스 배포/재시작" 전담.
