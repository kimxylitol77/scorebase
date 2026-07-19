# AI 회사 자동화 + 직원팀 검증 체크리스트 (2026-07-19)

목표. 잠자던 두 AI 시스템을 scorebase 전용으로 가동. (A) 맥미니 AI 회사(Ollama 7페르소나)를 사람 개입 없이 주간 자동 회의 + 텔레그램 보고로. (B) scorebase .claude/agents 직원팀 실호출 검증.

## A. AI 회사 자동화 (맥미니)

- [x] 헤드리스 러너 `ai-company/server/run_meeting.py` 작성 — 미션 자동 조립(경쟁사 idea-log 최근분) + 회의 실행 + 세션 JSON 저장 + notify 텔레그램 보고
- [x] 맥미니 scp 배포
- [x] 실회의 검증 — 세션 131841auto.json, 7명 전원 발언(PM 결론 포함), notify 200, 소요 약 4분
- [x] launchd 주간 회의 plist (`com.scorebase.ai-company-meeting`, 월 09:30 KST) 등록
- [x] launchd FastAPI 서버 plist (`com.scorebase.ai-company-server`, KeepAlive) 등록 — /agents 응답 확인
- [x] launchctl list 로 두 서비스 확인

## B. 직원팀 검증 (scorebase/.claude/agents)

- [x] 정적 검증 — 4파일 프론트매터(name/description/tools) 전부 정상
- [ ] **라이브 호출 검증 — 블록**: headless `claude -p` 가 401. ① 셸 ANTHROPIC_API_KEY 덮어씀(`env -u` 로 우회 가능) ② CLI OAuth 토큰 만료 → **사용자가 터미널에서 `claude login` 필요**. 로그인 후: `cd ~/scorebase && env -u ANTHROPIC_API_KEY claude -p "content-seo 서브에이전트 호출해 '검증 OK' 한 줄 회신받아 출력" --max-turns 6`

## 마무리

- [x] plist·docs 커밋/push (f7498c5) — ai-company/ 는 언트래킹 유지
- [x] 메모리 갱신 (project_ai_company, project_ai_team_agents, MEMORY.md)
