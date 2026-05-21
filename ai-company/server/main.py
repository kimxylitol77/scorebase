"""
ai-company FastAPI 서버 — AutoGen GroupChat 멀티 에이전트 회의 (Phase 1 MVP)

엔드포인트:
  GET  /agents   — 등록된 페르소나 list
  WS   /ws       — 미션 받아서 자율 회의 진행, 메시지 스트리밍

동작:
  client → {"type":"start", "mission":"..."}
  server → {"type":"agent_message", "id":"pm", "display_name":"김프로", "role":"...", "content":"..."}
  server → {"type":"done", "stop_reason":"..."}
  server → {"type":"session_end"}

실행:
  source venv/bin/activate
  python -m uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
"""

import asyncio
from pathlib import Path
from typing import Any

import yaml
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.teams import SelectorGroupChat
from autogen_agentchat.conditions import TextMentionTermination, MaxMessageTermination
from autogen_ext.models.openai import OpenAIChatCompletionClient
from autogen_core.models import ModelInfo

AGENTS_DIR = Path(__file__).parent.parent / "agents"


def make_client(model: str = "qwen2.5:14b") -> OpenAIChatCompletionClient:
    """Ollama OpenAI-호환 endpoint (/v1) 클라이언트."""
    return OpenAIChatCompletionClient(
        model=model,
        base_url="http://localhost:11434/v1",
        api_key="ollama",  # Ollama 는 키 무시, 더미값 필수
        model_info=ModelInfo(
            vision=False,
            function_calling=True,
            json_output=True,
            family="unknown",
            structured_output=True,
        ),
    )


def load_agents() -> tuple[list[AssistantAgent], dict[str, dict[str, str]]]:
    """agents/*.yaml 모두 로드 → AssistantAgent list + meta map."""
    agents = []
    meta: dict[str, dict[str, str]] = {}
    for yaml_file in sorted(AGENTS_DIR.glob("*.yaml")):
        cfg = yaml.safe_load(yaml_file.read_text(encoding="utf-8"))
        agent_id = cfg["id"]
        client = make_client(cfg.get("model", "qwen2.5:14b"))
        agent = AssistantAgent(
            name=agent_id,
            model_client=client,
            system_message=cfg["system_message"],
            description=cfg.get("role", ""),
        )
        agents.append(agent)
        meta[agent_id] = {
            "display_name": cfg.get("display_name", agent_id),
            "role": cfg.get("role", ""),
        }
    return agents, meta


def make_team() -> tuple[SelectorGroupChat, dict[str, dict[str, str]]]:
    """매 회의마다 새 team 인스턴스 생성 (state 격리)."""
    agents, meta = load_agents()
    # 7명 팀 — 한 사이클 + α 위해 18 메시지 한도 (3명 시는 12로 충분했음)
    termination = TextMentionTermination("회의 종료") | MaxMessageTermination(18)
    team = SelectorGroupChat(
        participants=agents,
        model_client=make_client(),
        termination_condition=termination,
        allow_repeated_speaker=False,
    )
    return team, meta


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/agents")
async def list_agents():
    _, meta = load_agents()
    return meta


@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") != "start":
                continue

            mission = data.get("mission", "")
            team, meta = make_team()
            task = (
                f"미션: {mission}\n\n"
                "각자 의견을 짧게 내고, PM이 종합해서 결론을 정리하면 "
                "마지막 메시지에 '회의 종료'라고 명시하시오."
            )

            async for event in team.run_stream(task=task):
                payload: dict[str, Any] | None = None
                # 메시지 이벤트
                if hasattr(event, "source") and hasattr(event, "content"):
                    src = getattr(event, "source", "")
                    if src in ("user", ""):
                        continue
                    m = meta.get(src, {"display_name": src, "role": ""})
                    payload = {
                        "type": "agent_message",
                        "id": src,
                        "display_name": m["display_name"],
                        "role": m["role"],
                        "content": str(event.content),
                    }
                # 종료 이벤트
                elif hasattr(event, "stop_reason"):
                    payload = {
                        "type": "done",
                        "stop_reason": getattr(event, "stop_reason", "") or "max_messages",
                    }

                if payload is not None:
                    await websocket.send_json(payload)
                    await asyncio.sleep(0)  # flush

            await websocket.send_json({"type": "session_end"})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_json({"type": "error", "message": str(e)})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
