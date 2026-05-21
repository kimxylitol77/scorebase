# launchd — Mac mini 자동 시작

5 봇 모두 macOS 부팅 시 자동 시작 + 크래시 시 자동 재시작.

## 봇 list

| Label | 주기 | 역할 |
|---|---|---|
| `com.scorebase.match-narrator` | 5분 | 라이브 매치 AI 코멘터리 (Ollama) |
| `com.scorebase.endpoint-monitor` | 5분 | scorebase 핵심 endpoint 헬스 ping |
| `com.scorebase.data-quality` | 15분 | LIVE 점수 누락·TBD 팀명 감시 |
| `com.scorebase.api-quota` | 30분 | api-football / api-sports 한도 알림 |
| `com.scorebase.preview-coverage` | 30분 | PREVIEW 누락 매치 알림 |

## 설치 (1회)

```bash
cd ~/dev/scorebase/mac-mini-worker/launchd
bash install.sh
```

자동으로:
1. node 경로 + 사용자 홈 plist 에 주입
2. `~/Library/LaunchAgents/` 로 복사
3. `launchctl load -w` 등록 + 즉시 시작

## 동작 확인

```bash
# 등록된 봇
launchctl list | grep scorebase

# 로그 (5 봇 통합)
tail -f /tmp/match-narrator.log /tmp/endpoint-monitor.log /tmp/data-quality.log /tmp/api-quota.log /tmp/preview-coverage.log

# 특정 봇 재시작
launchctl unload ~/Library/LaunchAgents/com.scorebase.endpoint-monitor.plist
launchctl load -w ~/Library/LaunchAgents/com.scorebase.endpoint-monitor.plist
```

## 중지·해제

```bash
cd ~/dev/scorebase/mac-mini-worker/launchd
bash uninstall.sh
```

자동으로:
1. 5 봇 `launchctl unload`
2. plist 파일 삭제
3. 남은 nohup 프로세스 `pkill` (혹시 직접 실행했을 경우)

## 옵션 설정

각 plist:
- **RunAtLoad** = true → 등록 즉시 시작
- **KeepAlive.SuccessfulExit** = false → 비정상 종료 시 자동 재시작
- **ThrottleInterval** = 30 → 30초 이내 재시작 반복 방지
- **StandardOut/ErrorPath** → `/tmp/{이름}.log`

부팅 시 자동 시작 (RunAtLoad + 사용자 로그인 후) — 별도 작업 불필요.

## 디버깅

```bash
# 봇 정상 실행 중인지 (PID 가 0 아닌 숫자면 살아있음)
launchctl list | grep scorebase

# 최근 에러
tail -100 /tmp/match-narrator.log

# 강제 즉시 시작 (load 됐는데 안 돌면)
launchctl start com.scorebase.match-narrator

# 완전 reset
bash uninstall.sh && bash install.sh
```
