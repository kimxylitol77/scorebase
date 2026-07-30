# 주간 팀 자율 가동 브리프 (감독자 루프용 지시서)

이 파일은 `scripts/handoff-supervisor.sh` 가 세그먼트마다 새 클로드 세션에 읽히는 작업 지시서다.
스케줄 트리거는 `~/.claude/scheduled-tasks/team-weekly-run/SKILL.md`(실행기)이고, 실제 일은 이 문서에 있다.
한국어로 진행하고 이모지는 쓰지 않는다.

목표. master 에이전트가 경쟁사 백로그를 직원들에게 분배·실행·검수하고, 주간 보고서를 제출한다.

## 안전선 (타협 불가)

- 발행·배포·git push·db push·외부 SNS 업로드를 절대 하지 않는다. 구현과 초안, 로컬 검증까지만.
- 사용자 승인이 필요한 항목은 보고서의 "kimss 판단 필요" 목록에 올린다.
- 챗봇 영역(src/components/Chatbot.tsx, src/app/api/chat/, src/lib/chatbot/)과 ai-brief-lib·브리핑 봇 4종은 건드리지 않는다.

## 세그먼트 규약

감독자가 이 브리프를 여러 세그먼트에 걸쳐 돌린다. 각 세그먼트는 컨텍스트 0%에서 시작한다.

- 이전 세그먼트의 인계 노트는 SessionStart 훅이 자동 주입한다. 주입된 게 있으면 그 지점부터 이어가고, 끝난 단계를 다시 하지 않는다. 노트가 실제 코드 상태와 다를 수 있으니 worktree·git 을 먼저 확인한다.
- 단계가 바뀔 때마다, master·직원 에이전트를 부르기 직전·직후에 `reports/handoff/current.md` 를 덮어쓴다. 담을 것 — 어느 단계인지, 분배한 후보와 담당, 끝난 것과 남은 것, 산출물 경로(worktree·초안·보고서).
- 5단계까지 끝나면 `reports/handoff/current.md` 를 삭제하고 마지막 줄에 `DONE` 만 출력한다. 그래야 감독자가 루프를 끝낸다.
- 노트를 갱신하지 않고 세그먼트를 끝내면 감독자가 "진전 없음"으로 판단해 중단한다.

## 실행 순서

1. 작업 공간 준비. 사용자의 작업 트리를 어지럽히지 않도록 main 기준 전용 worktree 를 만든다.
   ```
   cd /Users/kimss/scorebase && git worktree add .claude/worktrees/team-weekly-$(date +%m%d) -b team-weekly-$(date +%m%d) main
   ```
   이미 있으면 재사용. 코드 변경은 전부 이 worktree 안에서 하고, 커밋까지만 하고 push 는 하지 않는다.

2. Agent 도구로 subagent_type "master" 를 호출한다 (run_in_background: false). master 에게 넘길 프롬프트에 다음을 명시한다.
   - 백로그를 읽어라: ~/scorebase/mac-mini-worker/state/competitor-scout-ideas.jsonl (주간 실행 후보), ~/scorebase/mac-mini-worker/scorebase-features.md (이미 가진 것 — 중복 착수 금지).
   - 실행 후보를 최대 3건만 골라 content-seo / ops / growth / community 에 타입별로 분배·실행하라 (토큰 비용 통제).
   - 작업 디렉토리는 위 worktree 경로를 쓰라고 명시.
   - 위 안전선을 그대로 전달: 발행·배포·push 금지, 초안·구현·로컬 검증까지.
   - 사용자 노출 문구·발행물·대형 diff 는 qa 에이전트 재검수를 거쳐라.
   - 결과를 master 보고 형식([총괄 보고] — 처리 후보/검수 반려/kimss 판단 필요)으로 반환하라.

3. master 의 보고를 받아 보고서 파일로 저장한다: /Users/kimss/scorebase/reports/team/YYYY-MM-DD.md (디렉토리 없으면 생성). 내용은 master 보고 + 산출물 경로(worktree·초안 파일)를 포함한다.

4. 텔레그램 요약 전송. /Users/kimss/scorebase/.env.local 의 INTERNAL_API_TOKEN 을 읽어 다음처럼 호출한다.
   ```
   curl -s -X POST https://www.scorebase.kr/api/internal/notify \
     -H "Authorization: Bearer $INTERNAL_API_TOKEN" -H "Content-Type: application/json" \
     -d '{"source":"team-weekly","severity":"INFO","title":"주간 팀 보고","message":"<처리 N건 + 핵심 결과 3줄 + 판단 필요 항목 수. 보고서: reports/team/YYYY-MM-DD.md>"}'
   ```

5. 최종 출력에 보고서 요약(처리 건수·핵심 결과·판단 필요 목록)을 담는다. 실패한 단계가 있으면 정직하게 실패로 보고한다.

## 운영 노트 (2026-07-25 첫 가동에서 확인)

- master 가 Task 로 직원을 돌리면 직원 완료 통지가 master 가 아니라 이 세션으로 도착할 수 있다. 그 경우 직원 결과 요약(증거 경로 포함)을 SendMessage 로 master 에게 전달해 수합·qa·최종 보고를 진행시켜라. master 가 "직원 대기 중"으로 멈춘 채 통지가 안 오면 이 케이스다.
- 세그먼트가 갈리면 진행 중이던 서브에이전트는 함께 끝난다. 직원에게 넘긴 작업이 있으면 그 세그먼트 안에서 결과를 받아 노트에 적어라. 다음 세그먼트는 그 노트만 본다.
