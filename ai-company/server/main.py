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
from autogen_agentchat.teams import RoundRobinGroupChat
from autogen_agentchat.conditions import MaxMessageTermination
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


# RoundRobin 발언 순서 — PM 이 마지막 (결론 단계)
# 14B 가 SelectorGroupChat 에서 "회의 종료" 토큰을 첫 발언에 echo 하는 패턴 해결.
# 정확히 N 메시지 (= 페르소나 수) 후 강제 종료, 키워드 의존 X.
ROUND_ROBIN_ORDER = ["seo", "dev", "designer", "marketing", "analyst", "qa", "pm"]


def make_team() -> tuple[RoundRobinGroupChat, dict[str, dict[str, str]]]:
    """매 회의마다 새 team 인스턴스 생성 (state 격리)."""
    agents, meta = load_agents()
    # id → agent map 으로 ROUND_ROBIN_ORDER 적용
    by_id = {a.name: a for a in agents}
    ordered = [by_id[id_] for id_ in ROUND_ROBIN_ORDER if id_ in by_id]
    # 누락된 페르소나도 끝에 추가 (yaml 새로 추가했을 때 안전)
    extras = [a for a in agents if a.name not in ROUND_ROBIN_ORDER]
    if extras:
        ordered.extend(extras)

    # 정확히 N 메시지 (= 참가자 수) 후 종료
    termination = MaxMessageTermination(len(ordered))
    team = RoundRobinGroupChat(
        participants=ordered,
        termination_condition=termination,
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
                # ── DEBUG: 모든 event type 로그 (회의 본문 안 뜨는 원인 추적)
                event_type = type(event).__name__
                src_attr = getattr(event, "source", None)
                content_attr = getattr(event, "content", None)
                print(
                    f"[event] type={event_type} source={src_attr} "
                    f"content_len={len(str(content_attr)) if content_attr else 0}",
                    flush=True,
                )

                payload: dict[str, Any] | None = None

                # ── TaskResult (최종) — messages list + stop_reason 가짐
                if hasattr(event, "stop_reason") and not hasattr(event, "source"):
                    # 혹시 messages list 안에 우리가 놓친 게 있으면 emit
                    msgs = getattr(event, "messages", None)
                    if msgs:
                        for m in msgs:
                            m_src = getattr(m, "source", None)
                            m_content = getattr(m, "content", None)
                            if m_src and m_content and m_src != "user":
                                meta_m = meta.get(m_src, {"display_name": str(m_src), "role": ""})
                                print(f"[event/fallback] {m_src}: {str(m_content)[:60]}", flush=True)
                                await websocket.send_json({
                                    "type": "agent_message",
                                    "id": str(m_src),
                                    "display_name": meta_m["display_name"],
                                    "role": meta_m["role"],
                                    "content": str(m_content),
                                })
                    payload = {
                        "type": "done",
                        "stop_reason": str(getattr(event, "stop_reason", "")) or "max_messages",
                    }
                # ── 메시지 이벤트 — source + content 가짐
                elif src_attr is not None and content_attr is not None:
                    if src_attr in ("user", ""):
                        continue
                    src = str(src_attr)
                    m = meta.get(src, {"display_name": src, "role": ""})
                    payload = {
                        "type": "agent_message",
                        "id": src,
                        "display_name": m["display_name"],
                        "role": m["role"],
                        "content": str(content_attr),
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
