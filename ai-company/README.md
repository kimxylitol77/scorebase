# AI 회사 — 자율 회의 멀티 에이전트

PM · SEO · 개발자 3명 페르소나가 미션 받으면 자율 회의 (AutoGen GroupChat).

## 스택
- **Backend**: FastAPI + AutoGen 0.4 + OpenAI 호환 endpoint (Ollama)
- **Frontend**: Next.js 14 App Router + WebSocket
- **LLM**: Qwen 2.5 14B (Mac mini, Ollama)
- **Termination**: "회의 종료" 키워드 또는 max 12 메시지

## 셋업 (Mac mini)

```bash
# 1. 최신 코드 받기
cd ~/dev/scorebase  # 또는 ~/scorebase
git pull origin main

# 2. ai-company 폴더로
cd ai-company

# 3. Python 가상환경 + 의존성
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 4. Next.js webui (한 번만)
cd webui
npm install
cd ..

# 5. Ollama 모델 확인
curl http://localhost:11434/api/tags | grep qwen2.5
# qwen2.5:14b 보여야 함 — 없으면: ollama pull qwen2.5:14b
```

## 실행 (터미널 2개)

**터미널 1 — FastAPI 서버**:
```bash
cd ~/dev/scorebase/ai-company
source venv/bin/activate
python -m uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
```

**터미널 2 — Next.js dev**:
```bash
cd ~/dev/scorebase/ai-company/webui
npm run dev -- -H 0.0.0.0
```

## 접속

| 위치 | URL |
|---|---|
| 맥미니 자체 | http://localhost:3000 |
| 맥북 (직결 케이블) | http://169.254.190.8:3000 |
| Tailscale (작동 시) | http://100.92.46.59:3000 |

## 사용

1. 페이지 상단 입력창에 미션 입력
   - 예: "scorebase 에 NBA 라이브 페이지 추가하려는데 어떻게 접근?"
2. "회의 시작" 클릭
3. 3-5초 후 첫 발언 (보통 PM) — 메시지 카드로 표시
4. SelectorGroupChat 이 LLM 으로 다음 발언자 자동 선택
5. 3명이 번갈아 의견 → 보통 6-10턴 후 PM 결론 + "회의 종료"
6. 최대 12 메시지 hard limit

총 소요: **30초~2분** (14B 속도 기준)

## 페르소나 추가

`agents/*.yaml` 에 새 파일 추가 → 자동 인식.

```yaml
id: marketing                    # 영문 식별자 (AssistantAgent.name)
display_name: 이마케              # UI 표시명 (한글 OK)
role: 마케터                      # 카테고리 라벨
model: qwen2.5:14b               # Ollama 모델
system_message: |                # 페르소나 정의
  너는 한국 스포츠 미디어 마케터다.
  - ...
```

서버 재시작 시 자동 등록.

## Phase 진행도

- ✅ **Phase 0**: 환경 셋업 (venv, AutoGen, Redis, Next.js boot)
- ✅ **Phase 1**: MVP — 3명 자율 회의 (이 README)
- ⏳ **Phase 2**: 7명 풀팀 (디자인/마케팅/분석가/QA 추가)
- ⏳ **Phase 3**: 슬랙 UI (채널/DM/스레드/멘션)
- ⏳ **Phase 4**: 도구 통합 (Canva MCP / scorebase repo / KeywordTool)
- ⏳ **Phase 5**: 페르소나별 장기 기억 (벡터 DB)

## 디버깅

| 증상 | 진단 |
|---|---|
| `Module not found: autogen_agentchat` | `pip install -r requirements.txt` |
| `ECONNREFUSED 11434` | Ollama 안 돌아감 — `ollama serve &` |
| 메시지 안 옴 | 브라우저 콘솔 WebSocket 연결 + 서버 터미널 로그 확인 |
| 무한 반복 | `MaxMessageTermination(12)` 이 12개에서 잡아냄 |
| 너무 느림 | `qwen2.5:14b` → `llama3.1:8b` (각 YAML model 필드) |
