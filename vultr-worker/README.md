# Vultr 워커 (64.176.230.240)

맥미니에서 이전한 워커의 systemd 유닛 정본. 서버 `/etc/systemd/system/` 의 사본이며, 서버가 날아가도 여기서 복원한다.

## 디렉터리

| 경로 | 내용 |
|---|---|
| `bot-units/` | 감시봇 유닛 `scorebase-bot-*.service` / `.timer` |
| `job-units/` | 데이터 잡 유닛 `scorebase-job-*.service` / `.timer` + 드롭인 `*.service.d/*.conf` |
| `db-backup.sh` | DB 백업 스크립트 |

파일명은 서버의 유닛 이름과 1:1로 같다. 드롭인은 서버와 같은 디렉터리 구조(`<유닛명>.service.d/timeout.conf`)로 둔다.

## 배포 절차

유닛을 고쳤으면 서버에 복사하고 systemd 에 다시 읽힌다.

```bash
# 1. 유닛 복사 (드롭인은 디렉터리째)
scp vultr-worker/job-units/scorebase-job-XXX.service root@64.176.230.240:/etc/systemd/system/
scp -r vultr-worker/job-units/scorebase-job-XXX.service.d root@64.176.230.240:/etc/systemd/system/

# 2. systemd 재적재 (필수 — 안 하면 옛 정의가 그대로 돈다)
ssh root@64.176.230.240 'systemctl daemon-reload'

# 3. 반영
#    타이머로 도는 oneshot 잡은 daemon-reload 로 끝. 다음 발화부터 새 정의가 적용된다.
#    타이머 자체를 고쳤으면 재시작한다.
ssh root@64.176.230.240 'systemctl restart scorebase-job-XXX.timer'
#    상주 서비스(Type=simple, 예: threads-poster)는 서비스를 재시작해야 반영된다.
ssh root@64.176.230.240 'systemctl restart scorebase-job-threads-poster.service'

# 4. 확인
ssh root@64.176.230.240 'systemctl cat scorebase-job-XXX.service; systemctl list-timers --all | grep scorebase-job-XXX'
```

새 유닛을 처음 올릴 때만 `systemctl enable --now scorebase-job-XXX.timer` 를 추가로 실행한다.

## 주의

- 유닛 파일에는 시크릿을 넣지 않는다. 값이 필요하면 `EnvironmentFile=` 로 서버 로컬 경로만 가리킨다.
- 서버에서 직접 고쳤다면 저장소에도 즉시 되반영한다. 대조는 아래로 한다.

```bash
ssh root@64.176.230.240 'cd /etc/systemd/system && tar cf - scorebase-job-*.service scorebase-job-*.timer scorebase-job-*.service.d' | tar xf - -C /tmp/srv-units && diff -r vultr-worker/job-units /tmp/srv-units
```

- `scorebase-job-threads-poster.service` 는 타이머가 없다. 내부 30분 루프를 도는 상주 서비스라 `Restart=always` 로 유지된다.
  단 `[Install]` 절이 없어 `static` 상태다(2026-09-03 수동 start 이후 계속 running). 서버 재부팅 시 자동으로 다시 뜨지 않으니 복원 후에는 `systemctl start` 를 직접 해야 한다.
