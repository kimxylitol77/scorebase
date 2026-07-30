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
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

import yaml
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.teams import RoundRobinGroupChat
from autogen_agentchat.conditions import MaxMessageTermination
from autogen_ext.models.openai import OpenAIChatCompletionClient
from autogen_core.models import ModelInfo

AGENTS_DIR = Path(__file__).parent.parent / "agents"
SESSIONS_DIR = Path(__file__).parent.parent / "data" / "sessions"
SESSIONS_DIR.mkdir(parents=True, exist_ok=True)


def save_session(session: dict[str, Any]) -> Path:
    """회의 1건을 JSON 파일로 저장. data/sessions/YYYY-MM-DD/{id}.json"""
    date_str = datetime.now().strftime("%Y-%m-%d")
    date_dir = SESSIONS_DIR / date_str
    date_dir.mkdir(parents=True, exist_ok=True)
    file_path = date_dir / f"{session['id']}.json"
    file_path.write_text(
        json.dumps(session, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return file_path


def make_client(model: str = "qwen2.5:14b") -> OpenAIChatCompletionClient:
    """Ollama OpenAI-호환 endpoint (/v1) 클라이언트."""
    return OpenAIChatCompletionClient(
        model=model,
        base_url="http://localhost:11434/v1",
        api_key="ollama",
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

    # 참가자 전원 발언 후 종료. +1 = 최초 task(user) 메시지도 카운트에 포함되기 때문
    # (기존 len(ordered)는 마지막 순서인 pm 이 발언 전에 잘리는 off-by-one — 2026-07-19 교정)
    termination = MaxMessageTermination(len(ordered) + 1)
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


@app.get("/sessions")
async def list_sessions(limit: int = 50):
    """모든 회의 list (최신순). 파일 시스템 기반 — JSON 파일을 mtime 으로 정렬."""
    files: list[Path] = []
    if SESSIONS_DIR.exists():
        for date_dir in sorted(SESSIONS_DIR.iterdir(), reverse=True):
            if not date_dir.is_dir():
                continue
            files.extend(sorted(date_dir.glob("*.json"), key=lambda f: f.stat().st_mtime, reverse=True))
            if len(files) >= limit:
                break
    files = files[:limit]
    sessions = []
    for f in files:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            sessions.append(
                {
                    "id": data.get("id"),
                    "started_at": data.get("started_at"),
                    "ended_at": data.get("ended_at"),
                    "mission": data.get("mission", "")[:120],
                    "message_count": len(data.get("messages", [])),
                    "stop_reason": data.get("stop_reason"),
                }
            )
        except Exception:
            continue
    return {"sessions": sessions, "total": len(sessions)}


@app.get("/sessions/{session_id}")
async def get_session(session_id: str):
    """단일 회의 전체 (메시지 포함)."""
    # 모든 date dir 에서 검색 (파일명 = session_id.json)
    if SESSIONS_DIR.exists():
        for date_dir in sorted(SESSIONS_DIR.iterdir(), reverse=True):
            if not date_dir.is_dir():
                continue
            candidate = date_dir / f"{session_id}.json"
            if candidate.exists():
                return json.loads(candidate.read_text(encoding="utf-8"))
    raise HTTPException(status_code=404, detail=f"session {session_id} not found")


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
                "⚠️ 회의 규칙 (엄수):\n"
                "1. **한국어로만** 응답. 중국어/영어/일본어 단어 섞지 마라.\n"
                "2. **너 자신의 발언 1개만** 작성. 절대 다른 페르소나 답변을 만들지 마라.\n"
                "3. 답변은 2-3문장. 짧게.\n"
                "4. 미션과 무관한 주제 (차량/번호판/관련 없는 기능) 절대 언급 X.\n"
                "5. 자기 페르소나의 전문 영역에서만 발언.\n\n"
                f"미션: {mission}"
            )

            # ── 세션 시작 — 회의 기록 buffer
            session_id = uuid.uuid4().hex[:10]
            session: dict[str, Any] = {
                "id": session_id,
                "started_at": datetime.now().isoformat(),
                "mission": mission,
                "messages": [],
                "ended_at": None,
                "stop_reason": None,
            }

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
                    # 혹시 messages list 안에 우리가 놓친 게 있으면 emit + buffer 에 저장
                    msgs = getattr(event, "messages", None)
                    if msgs:
                        for m in msgs:
                            m_src = getattr(m, "source", None)
                            m_content = getattr(m, "content", None)
                            if m_src and m_content and m_src != "user":
                                meta_m = meta.get(m_src, {"display_name": str(m_src), "role": ""})
                                msg_obj = {
                                    "type": "agent_message",
                                    "id": str(m_src),
                                    "display_name": meta_m["display_name"],
                                    "role": meta_m["role"],
                                    "content": str(m_content),
                                }
                                session["messages"].append({**msg_obj, "at": datetime.now().isoformat()})
                                print(f"[event/fallback] {m_src}: {str(m_content)[:60]}", flush=True)
                                await websocket.send_json(msg_obj)
                    stop_reason = str(getattr(event, "stop_reason", "")) or "max_messages"
                    session["ended_at"] = datetime.now().isoformat()
                    session["stop_reason"] = stop_reason
                    saved_path = save_session(session)
                    payload = {
                        "type": "done",
                        "stop_reason": stop_reason,
                        "session_id": session_id,
                        "saved_path": str(saved_path.relative_to(SESSIONS_DIR.parent.parent)),
                    }
                # ── 메시지 이벤트 — source + content 가짐
                elif src_attr is not None and content_attr is not None:
                    if src_attr in ("user", ""):
                        continue
                    src = str(src_attr)
                    m = meta.get(src, {"display_name": src, "role": ""})
                    msg_obj = {
                        "type": "agent_message",
                        "id": src,
                        "display_name": m["display_name"],
                        "role": m["role"],
                        "content": str(content_attr),
                    }
                    session["messages"].append({**msg_obj, "at": datetime.now().isoformat()})
                    payload = msg_obj

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
