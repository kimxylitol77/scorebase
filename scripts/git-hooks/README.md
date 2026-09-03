# 검증 장치 3종 (git 훅 + Claude Stop 훅)

"tsc 돌려라, 임시 파일 커밋하지 마라, 테스트 통과시켜라"를 프롬프트로 부탁하던 것을 시스템이 강제하도록 바꾼 것이다. 규칙이 사람이나 에이전트의 기억이 아니라 장치에 들어 있으므로 잊어도 지켜진다.

## 활성화

git 훅은 저장소 설정으로 켠다. 클론이나 새 머신에서는 한 번만 실행한다.

```bash
git config core.hooksPath scripts/git-hooks
```

Claude Stop 훅은 `.claude/settings.json` 에 등록돼 있어 별도 설정이 없다.

## 장치

| 시점 | 파일 | 검사 |
| --- | --- | --- |
| Claude 턴 종료 | `scripts/claude-hooks/stop-verify.sh` | src·scripts 의 ts 파일이 바뀐 채 턴을 끝내려 하면 tsc + `npm test`. 실패하면 턴이 끝나지 않고 고치러 돌아간다 |
| `git commit` | `pre-commit` | `_` 접두 scratch 코드 파일 신규 추가 차단 · `schema.prisma` 변경 시 `prisma/sql/*.sql` 동반 필수 · ts 변경 시 tsc + 테스트 |
| `git push` | `pre-push` | tsc + 테스트. pre-commit 을 통과한 트리는 표시가 남아 있어 다시 돌리지 않는다 |

비용은 tsc 약 5초, 테스트 약 3초다.

## 우회

- git 훅 전체: `git commit --no-verify` / `git push --no-verify`. 원칙적으로 쓰지 않는다.
- scratch 검사만: `SKIP_SCRATCH_GUARD=1 git commit ...`
- 스키마 SQL 검사만 (DB 에 영향 없는 schema 변경): `SKIP_SCHEMA_SQL=1 git commit ...`
- Stop 훅은 같은 세션에서 3번 연속 실패하면 스스로 물러나고 사용자에게 맡긴다.

## 결정 근거

- **스키마 변경에 SQL 동반**. 프로덕션은 `db push` 가 hang 을 일으켜 ALTER 를 Neon SQL 에디터에서 직접 실행하는데, 그 SQL 이 어디에도 남지 않았다. 커밋에 같이 넣어야 어떤 컬럼이 언제 어떻게 추가됐는지 재현할 수 있다.
- **브랜치 보호 대신 pre-push**. 1인 운영이고 main 직접 push 로 Vercel 배포가 도는 구조라 GitHub 브랜치 보호(PR 필수)는 작업 흐름을 깨뜨린다. push 직전 로컬 검증이 같은 역할을 한다. PR 흐름으로 바꾸고 싶으면 그때 보호 규칙을 켠다.
- **node_modules 없는 워크트리는 건너뛴다**. 병렬 세션 워크트리에는 의존성이 없을 수 있다. 거기서는 경고만 내고 통과시키며, 메인 저장소의 pre-push 가 최종 방어선이다.
- **"테스트를 고치지 말고 코드를 고쳐라"**. 실패 메시지마다 이 문장을 붙인다. 붙이지 않으면 에이전트가 테스트를 약화시켜 초록불을 만드는 쪽으로 새기 때문이다.
