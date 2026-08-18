# 맥미니 봇 git push 재시도 — 체크리스트

## 목표
`data/*.json` 을 자동 push 하는 맥미니 봇이 push 경합(non-fast-forward)에 밀렸을 때
그날치 산출물을 버리지 않고 rebase 후 재시도해 반영한다.

## 성공 기준
- 락/경합 시나리오를 더미 repo 로 재현해, 재시도 후 push 가 성공한다.
- 재시도 전부 실패 시에도 커밋은 로컬에 보존되고 스크립트는 명시적 실패로 끝난다.
- `zsh -n` 문법 검사 전부 통과.
- 무관한 파일·줄 변경 0.

## 작업
- [x] push 사용처 전수 스캔 (로컬 + 맥미니 양쪽)
- [x] 실패 이력 실측 (봇별 rejected 횟수)
- [x] 충돌 쌍 규명 (맥미니 golf 09:00 KST ↔ 맥북 cron-wc-xi 07:00@+07 = 09:00 KST)
- [x] worktree 생성 (team-daily-0818)
- [x] 공용 `mac-mini-worker/git-push-lib.sh` 신규
- [x] daily-golf-korea.sh 적용
- [x] daily-fifa-rankings.sh 적용
- [x] daily-ts-team-mapping.sh 적용
- [x] weekly-static-refresh.sh 적용
- [x] 더미 repo 재현 검증 (경합 → 재시도 성공 / 전패 → 커밋 보존 + exit 1)
- [x] zsh -n 전수
- [x] 커밋 (push 는 승인 대기)

## 범위 밖 (보고만)
- `weekly-player-names.sh` — 맥미니에만 있고 repo 에 없는 미버전관리 파일. 편입 여부는 사용자 판단.
- `scripts/cron-wc-xi.sh` — 이미 rebase 재시도 보유(8/15 추가). 미추적 파일이라 손대지 않음.
