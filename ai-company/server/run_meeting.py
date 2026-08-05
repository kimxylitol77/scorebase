# scorebase 주간 자동 회의 러너 — launchd 가 월 09:30 실행, 사람 개입 0.
#
# 하는 일:
#   1) mac-mini-worker/state/idea-log.jsonl 최근 2일치(경쟁사 관찰·아이디어)로 미션 조립
#   2) server.main 의 RoundRobinGroupChat 7페르소나 회의 헤드리스 실행
#   3) 세션 JSON 저장 (data/sessions/YYYY-MM-DD/{id}.json — 웹 UI/REST 와 동일 포맷)
#   4) 김프로(PM) 결론을 /api/internal/notify 로 텔레그램 보고
#
# 수동 실행: cd ~/dev/scorebase/ai-company && venv/bin/python server/run_meeting.py "미션 직접 입력(옵션)"

import asyncio
import html
import json
import sys
import urllib.request
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from server.main import make_team, save_session  # noqa: E402

REPO = Path.home() / "dev" / "scorebase"
IDEA_LOG = REPO / "mac-mini-worker" / "state" / "idea-log.jsonl"          # competitor-watch (기존 경쟁사 변화)
SCOUT_LOG = REPO / "mac-mini-worker" / "state" / "competitor-scout-ideas.jsonl"  # competitor-scout (GPT 신규 발굴)
ENV_FILE = REPO / ".env.local"
SOURCE = "mac-mini-ai-company"


def load_env() -> dict[str, str]:
    """KEY=VALUE 형식 .env.local 파싱 (dotenv 미설치 환경 대비 수동)."""
    env: dict[str, str] = {}
    if not ENV_FILE.exists():
        return env
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def _tail_jsonl(path: Path, n: int, cap: int) -> list[str]:
    """jsonl 마지막 n건의 report 필드를 [날짜]\\n본문 형태로 (본문 cap 자 절단)."""
    out: list[str] = []
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8").strip().splitlines()[-n:]:
        try:
            entry = json.loads(line)
            out.append(f"[{entry.get('date', '?')}]\n{entry.get('report', '')[:cap]}")
        except json.JSONDecodeError:
            continue
    return out


def recent_done() -> str:
    """최근 2주 커밋 제목 — '이미 구현된 것' 목록. 회의가 기배포 기능을 재제안하는 것 방지."""
    import subprocess

    try:
        # -60: 주말 배포 러시 주간엔 14일치가 30건을 훌쩍 넘어 기배포 기능이 잘림
        # (첫 적용 회의에서 d11fc4d FIP·LOB% 가 잘려나가 P0 로 재제안된 사고)
        r = subprocess.run(
            ["git", "log", "--since=14 days ago", "--format=%s", "-60"],
            cwd=REPO, capture_output=True, text=True, timeout=10,
        )
        titles = [t for t in r.stdout.splitlines() if t.strip()][:60]
        return "\n".join(f"- {t}" for t in titles) if titles else "(없음)"
    except Exception:
        return "(조회 실패)"


def _internal_get(env: dict[str, str], path: str, timeout: int = 20) -> dict | None:
    """사이트 internal API GET. 실패해도 회의는 돌아야 하므로 None 만 돌려준다."""
    token = env.get("INTERNAL_API_TOKEN", "")
    if not token:
        return None
    site = env.get("SITE_URL", "https://www.scorebase.kr")
    site = site.replace("://scorebase.kr", "://www.scorebase.kr").rstrip("/")
    req = urllib.request.Request(
        f"{site}{path}",
        headers={"Authorization": f"Bearer {token}"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read().decode("utf-8"))
    except Exception:
        return None


def persona_data(env: dict[str, str]) -> str:
    """
    페르소나별 '자기 영역' 실측 블록.

    왜 필요한가. 기존 미션은 경쟁사 로그 2건을 본문 끝에 붙여 **전원에게 똑같이** 줬다.
    그래서 7명이 그 2건만 붙잡고 재배열했고, 자기 영역 제안이 0건이었다(2026-07-30 진단:
    발언 모델을 14b→32b 로 올려도 그대로, 병목은 모델이 아니라 입력 구조).
    각자에게 자기 숫자를 쥐여줘야 자기 얘기를 한다.

    데이터가 없으면 그 줄은 "(자료 없음)" 으로 남긴다 — 없는 걸 지어내라고 시키지 않는다.
    """
    brief = _internal_get(env, "/api/internal/daily-brief") or {}
    sanity = _internal_get(env, "/api/internal/data-sanity") or {}

    def fmt_acc() -> str:
        acc = brief.get("accuracy") or {}
        if not acc:
            return "(자료 없음)"
        parts = [
            f"{lg} {v.get('pct')}%({v.get('hit')}/{v.get('total')})"
            for lg, v in acc.items()
            if isinstance(v, dict) and v.get("pct") is not None
        ]
        return " · ".join(parts) if parts else "(자료 없음)"

    def fmt_traffic() -> str:
        t = brief.get("traffic") or {}
        if not t:
            return "(자료 없음)"
        return f"사람 {t.get('human')}PV · 봇 {t.get('bot')}PV · 방문자 {t.get('uniqueVisitors')}명"

    def fmt_issues() -> str:
        iss = sanity.get("issues")
        if not isinstance(iss, list):
            return "(조회 실패)"
        if not iss:
            return "현재 미해결 0건"
        kinds: dict[str, int] = {}
        for i in iss:
            k = str(i.get("kind", "?"))
            kinds[k] = kinds.get(k, 0) + 1
        return " · ".join(f"{k} {n}건" for k, n in kinds.items())

    def fmt_bots() -> str:
        fb = brief.get("failedBots")
        if not fb:
            return "실패 봇 없음"
        if isinstance(fb, list):
            return ", ".join(str(x) for x in fb[:6]) or "실패 봇 없음"
        return str(fb)[:200]

    def fmt_articles() -> str:
        a = brief.get("newArticles") or {}
        return " · ".join(f"{k} {v}건" for k, v in a.items()) if a else "(어제 신규 글 없음)"

    def fmt_matches() -> str:
        m = brief.get("todayMatches") or {}
        if not m:
            return "(자료 없음)"
        top = sorted(m.items(), key=lambda kv: -kv[1])[:6]
        return " · ".join(f"{lg} {n}경기" for lg, n in top)

    return (
        f"[analyst] 어제 리그별 AI 적중률 — {fmt_acc()}\n"
        f"[dev] 데이터 품질 미해결 — {fmt_issues()} / 봇 실패 — {fmt_bots()}\n"
        f"[qa] 같은 품질 지표를 dev 와 공유한다. 위 항목 중 **사용자 화면에 보이는 것**을 골라 지적하라.\n"
        f"[marketing] 어제 트래픽 — {fmt_traffic()}\n"
        f"[seo] 어제 신규 글 — {fmt_articles()} (검색 유입은 색인된 글 수·제목에 좌우된다)\n"
        f"[designer] 오늘 경기 분포 — {fmt_matches()} (경기가 많은 리그 화면이 가장 많이 보인다)\n"
        f"[pm] 위 숫자들을 근거로 우선순위를 정하라. 근거 없는 항목은 P2 로 내려라."
    )


def build_mission(env: dict[str, str] | None = None) -> str:
    """경쟁사 봇 2종(watch=기존 변화, scout=GPT 신규 발굴) + 최근 완료 + **페르소나별 실측**으로 미션 조립."""
    watch = _tail_jsonl(IDEA_LOG, 2, 1500)
    scout = _tail_jsonl(SCOUT_LOG, 2, 800)
    watch_text = "\n\n".join(watch) if watch else "(자료 없음)"
    scout_text = "\n\n".join(scout) if scout else "(신규 발굴 없음)"
    return (
        "scorebase(한국어 스포츠 라이브스코어·AI 예측 사이트, 1인 운영) 주간 개선 회의.\n"
        "아래 자료를 참고해, 이번 주 scorebase 에 실제 적용할 개선을 정하라.\n"
        "각자 자기 전문영역에서 구체적 제안 1가지(대상 페이지/기능 명시). "
        "**아래 '페르소나별 실측' 에서 자기 이름이 붙은 줄의 숫자를 반드시 근거로 인용하라** "
        "— 그 숫자를 언급하지 않은 제안은 채택되지 않는다. "
        "designer 는 실제 화면 기준 UI 수정 제안 필수. "
        "pm 은 제안들을 모아 P0/P1/P2 우선순위 표(항목·담당·기대효과)로 결론.\n"
        "⚠️ '이미 구현된 것' 목록에 있는 기능을 다시 제안하지 마라 — 그 위의 개선·확장만 허용.\n\n"
        f"── 기존 경쟁사 최근 변화 (watch) ──\n{watch_text}\n\n"
        f"── 신규 경쟁사 발굴 (scout) ──\n{scout_text}\n\n"
        f"── 이미 구현된 것 (최근 2주 배포) ──\n{recent_done()}\n\n"
        f"── 페르소나별 실측 (자기 줄만 볼 것) ──\n{persona_data(env or {})}"
    )


def notify(env: dict[str, str], title: str, message: str) -> None:
    site = env.get("SITE_URL", "https://www.scorebase.kr")
    # 비-www 도메인은 308 리다이렉트로 POST 가 죽음 — www 로 정규화
    site = site.replace("://scorebase.kr", "://www.scorebase.kr").rstrip("/")
    token = env.get("INTERNAL_API_TOKEN", "")
    if not token:
        print("⚠️ INTERNAL_API_TOKEN 없음 — 텔레그램 보고 생략", flush=True)
        return
    body = json.dumps(
        {"source": SOURCE, "severity": "INFO", "title": title, "message": message},
        ensure_ascii=False,
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{site}/api/internal/notify",
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as res:
        print(f"notify → {res.status}", flush=True)


async def run() -> None:
    env = load_env()
    mission = sys.argv[1] if len(sys.argv) > 1 else build_mission(env)
    print(f"[{datetime.now().isoformat()}] ▶ 회의 시작 — 미션 {len(mission)}자", flush=True)

    team, meta = make_team()
    # 회의 규칙은 server/main.py WS 경로와 동일 유지 (14B 페르소나 흉내·언어 혼입 완화)
    task = (
        "⚠️ 회의 규칙 (엄수):\n"
        "1. **한국어로만** 응답. 중국어/영어/일본어 단어 섞지 마라.\n"
        "2. **너 자신의 발언 1개만** 작성. 절대 다른 페르소나 답변을 만들지 마라.\n"
        "3. 답변은 2-3문장. 짧게. (pm 의 결론 표만 예외)\n"
        "4. 미션과 무관한 주제 절대 언급 X.\n"
        "5. 자기 페르소나의 전문 영역에서만 발언.\n"
        "6. 앞 사람이 이미 낸 제안을 반복·요약하지 마라. 반드시 자기 영역의 **새로운** 제안을 내라.\n\n"
        f"미션: {mission}"
    )

    session_id = datetime.now().strftime("%H%M%S") + "auto"
    session = {
        "id": session_id,
        "started_at": datetime.now().isoformat(),
        "mission": mission,
        "messages": [],
        "ended_at": None,
        "stop_reason": None,
    }

    async for event in team.run_stream(task=task):
        src = getattr(event, "source", None)
        content = getattr(event, "content", None)
        if hasattr(event, "stop_reason") and src is None:
            # TaskResult — 스트림에서 놓친 메시지 폴백 수거 (server/main.py 와 동일 로직)
            for m in getattr(event, "messages", None) or []:
                m_src, m_content = getattr(m, "source", None), getattr(m, "content", None)
                if m_src and m_content and m_src != "user" and not any(
                    x["id"] == str(m_src) and x["content"] == str(m_content) for x in session["messages"]
                ):
                    dn = meta.get(str(m_src), {}).get("display_name", str(m_src))
                    session["messages"].append(
                        {"type": "agent_message", "id": str(m_src), "display_name": dn,
                         "role": meta.get(str(m_src), {}).get("role", ""),
                         "content": str(m_content), "at": datetime.now().isoformat()}
                    )
            session["stop_reason"] = str(getattr(event, "stop_reason", "")) or "max_messages"
        elif src and content and str(src) != "user":
            dn = meta.get(str(src), {}).get("display_name", str(src))
            print(f"  💬 {dn}: {str(content)[:80]}", flush=True)
            session["messages"].append(
                {"type": "agent_message", "id": str(src), "display_name": dn,
                 "role": meta.get(str(src), {}).get("role", ""),
                 "content": str(content), "at": datetime.now().isoformat()}
            )

    session["ended_at"] = datetime.now().isoformat()
    saved = save_session(session)
    print(f"세션 저장 → {saved}", flush=True)

    # PM(김프로) 결론 우선, 없으면 마지막 발언
    pm_msgs = [m for m in session["messages"] if m["id"] == "pm"]
    conclusion = (pm_msgs[-1] if pm_msgs else session["messages"][-1])["content"] if session["messages"] else "(발언 없음)"
    speakers = " · ".join(dict.fromkeys(m["display_name"] for m in session["messages"]))

    summary = html.escape(conclusion)[:2500]
    notify(
        env,
        "AI 회사 일일 회의 결론 (P0/P1/P2)",
        f"참석: {speakers}\n\n{summary}\n\n(전체 회의록: ai-company/data/sessions/{datetime.now().strftime('%Y-%m-%d')}/{session_id}.json)",
    )
    print(f"[{datetime.now().isoformat()}] ✅ 회의 종료 — 발언 {len(session['messages'])}건", flush=True)


if __name__ == "__main__":
    asyncio.run(run())
