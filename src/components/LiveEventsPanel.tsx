// 라이브 매치 카드 expand 시 노출되는 fixture events panel (축구 전용).
// 클라이언트 lazy fetch — 카드 펼치는 순간 /api/live/events?fixture=X 호출.
// 30초 간격으로 자동 refresh (matches polling 과 같은 주기).

"use client";

import { useEffect, useState } from "react";

interface FixtureEvent {
  minute: number;
  type: string;
  teamName: string;
  playerName: string;
  detail?: string;
}

interface Props {
  /** "af-12345" 같은 LiveMatch.id — "af-" prefix 떼어내고 fixture id 추출 */
  matchId: string;
}

function eventEmoji(type: string): string {
  switch (type) {
    case "goal":
      return "⚽";
    case "own-goal":
      return "🔁";
    case "penalty":
      return "🎯";
    case "yellow":
      return "🟨";
    case "red":
      return "🟥";
    case "subst":
      return "🔄";
    case "var":
      return "📺";
    default:
      return "•";
  }
}

const POLL_MS = 30_000;

export default function LiveEventsPanel({ matchId }: Props) {
  const [events, setEvents] = useState<FixtureEvent[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // af-prefix 매치만 fixture events 가능 (API-Football)
  const fixtureId = matchId.startsWith("af-") ? matchId.slice(3) : null;
  // 미지원은 props 만 보면 알 수 있다 — effect 로 setState 할 이유가 없다.
  const error = fixtureId ? fetchError : "이 종목은 events 미지원";

  useEffect(() => {
    if (!fixtureId) return;
    let alive = true;
    const fetchOnce = async () => {
      try {
        const res = await fetch(`/api/live/events?fixture=${fixtureId}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json: { events?: FixtureEvent[]; error?: string } = await res.json();
        if (!alive) return;
        if (json.error) setFetchError(json.error);
        else setEvents(json.events ?? []);
      } catch (e) {
        if (alive) setFetchError((e as Error).message);
      }
    };
    fetchOnce();
    const id = setInterval(() => {
      if (!document.hidden) fetchOnce();
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [fixtureId]);

  if (error) {
    return <div className="text-[11px] text-neutral-400 px-3 py-2">{error}</div>;
  }
  if (events === null) {
    return (
      <div className="text-[11px] text-neutral-400 px-3 py-2 animate-pulse">
        이벤트 불러오는 중…
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <div className="text-[11px] text-neutral-400 px-3 py-2">
        아직 이벤트가 없습니다.
      </div>
    );
  }
  // 최근순 (분 내림차순)
  const sorted = [...events].sort((a, b) => b.minute - a.minute);

  return (
    <ul className="text-xs px-3 py-2 space-y-1 max-h-48 overflow-y-auto">
      {sorted.map((e, i) => (
        <li
          key={`${e.minute}-${e.playerName}-${i}`}
          className="flex items-center gap-2"
        >
          <span className="tabular-nums text-neutral-400 w-8 shrink-0 text-right">
            {e.minute}&apos;
          </span>
          <span aria-hidden>{eventEmoji(e.type)}</span>
          <span className="font-medium truncate">{e.playerName || "—"}</span>
          {e.detail && (
            <span className="text-[10px] text-neutral-400 truncate">
              {e.detail}
            </span>
          )}
          <span className="ml-auto text-[10px] text-neutral-500 truncate">
            {e.teamName}
          </span>
        </li>
      ))}
    </ul>
  );
}
