// 농구 선수 기록(박스스코어) 탭 — MatchInsight "선수 기록" 탭 content (client).
// /api/live/match/[gameId] 를 자체 폴링해 summary.homePlayers/awayPlayers 렌더.
// NBA 는 route 의 resolveNbaGameId 가 팀명 필요 → away/home 쿼리 동봉.
// 데이터 출처: api-sports (NBA v2 /players/statistics, WNBA v1 /games/statistics/players).

"use client";

import { useEffect, useRef, useState } from "react";

interface PlayerBox {
  name: string;
  pos?: string | null;
  starter?: boolean;
  min: string;
  points: number;
  reb: number;
  oreb?: number | null;
  assists: number;
  steals?: number | null;
  blocks?: number | null;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
}

interface Props {
  gameId: string;
  league: string;
  homeNameKo: string;
  awayNameKo: string;
  homeNameEn: string;
  awayNameEn: string;
}

const POLL_LIVE_MS = 10_000;
const POLL_IDLE_MS = 60_000;

type Filter = "ALL" | "HOME" | "AWAY";

export default function BasketballBoxScoreTab({
  gameId,
  league,
  homeNameKo,
  awayNameKo,
  homeNameEn,
  awayNameEn,
}: Props) {
  const [home, setHome] = useState<PlayerBox[]>([]);
  const [away, setAway] = useState<PlayerBox[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>("ALL");
  const statusRef = useRef<"LIVE" | "OTHER">("OTHER");

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastEtag: string | null = null;

    const url =
      `/api/live/match/${gameId}?league=${encodeURIComponent(league)}` +
      `&away=${encodeURIComponent(awayNameEn)}&home=${encodeURIComponent(homeNameEn)}`;

    const fetchOnce = async () => {
      try {
        const headers: HeadersInit = lastEtag ? { "if-none-match": lastEtag } : {};
        const res = await fetch(url, { cache: "no-store", headers });
        if (res.status === 304) return;
        if (!res.ok) return;
        const etag = res.headers.get("etag");
        if (etag) lastEtag = etag;
        const json: {
          live?: {
            status?: string;
            summary?: { homePlayers?: PlayerBox[]; awayPlayers?: PlayerBox[] } | null;
          };
        } = await res.json();
        if (!alive) return;
        statusRef.current = json.live?.status === "LIVE" ? "LIVE" : "OTHER";
        setHome(json.live?.summary?.homePlayers ?? []);
        setAway(json.live?.summary?.awayPlayers ?? []);
        setLoaded(true);
      } catch {
        // ignore
      }
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (typeof document !== "undefined" && document.hidden) return;
      const wait = statusRef.current === "LIVE" ? POLL_LIVE_MS : POLL_IDLE_MS;
      timer = setTimeout(async () => {
        await fetchOnce();
        schedule();
      }, wait);
    };
    fetchOnce().then(schedule);
    const onVis = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
      } else {
        fetchOnce();
        schedule();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [gameId, league, homeNameEn, awayNameEn]);

  const hasData = home.length > 0 || away.length > 0;

  if (!hasData) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800 p-4 text-xs text-neutral-500">
        {loaded
          ? "ⓘ 선수 기록은 경기 시작 후 제공됩니다."
          : "선수 기록 불러오는 중…"}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        {(
          [
            ["ALL", "전체"],
            ["AWAY", awayNameKo],
            ["HOME", homeNameKo],
          ] as Array<[Filter, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              filter === key
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/[0.06] dark:text-white/60 dark:hover:bg-white/10"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {(filter === "ALL" || filter === "AWAY") && away.length > 0 && (
        <BoxTable teamName={awayNameKo} players={away} />
      )}
      {(filter === "ALL" || filter === "HOME") && home.length > 0 && (
        <BoxTable teamName={homeNameKo} players={home} />
      )}

      <p className="text-[11px] text-neutral-500">
        ⓘ 데이터 출처: api-sports. 출전 선수만 표시(득점 내림차순). FG/3PT/FT 는
        성공-시도.
      </p>
    </div>
  );
}

function BoxTable({ teamName, players }: { teamName: string; players: PlayerBox[] }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-bold text-zinc-700 dark:text-white/70">
        {teamName}
      </div>
      <div className="overflow-x-auto rounded-[1rem] ring-1 ring-black/5 dark:ring-white/10">
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500 dark:bg-white/[0.04] dark:text-white/45">
            <tr>
              <th className="px-2.5 py-2 text-left font-semibold">선수</th>
              <th className="px-1.5 py-2 text-right font-semibold">MIN</th>
              <th className="px-1.5 py-2 text-right font-semibold">PTS</th>
              <th className="px-1.5 py-2 text-right font-semibold">REB</th>
              <th className="px-1.5 py-2 text-right font-semibold">AST</th>
              <th className="px-1.5 py-2 text-right font-semibold">STL</th>
              <th className="px-1.5 py-2 text-right font-semibold">BLK</th>
              <th className="px-1.5 py-2 text-right font-semibold">FG</th>
              <th className="px-1.5 py-2 text-right font-semibold">3PT</th>
              <th className="px-2.5 py-2 text-right font-semibold">FT</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 dark:divide-white/10">
            {players.map((p, i) => (
              <tr key={`${p.name}-${i}`}>
                <td className="px-2.5 py-2 text-left">
                  <span className="font-medium text-zinc-900 dark:text-white">
                    {p.name}
                  </span>
                  {p.pos && (
                    <span className="ml-1 text-[10px] text-zinc-400">{p.pos}</span>
                  )}
                </td>
                <td className="px-1.5 py-2 text-right tabular-nums text-zinc-500">
                  {p.min || "-"}
                </td>
                <td className="px-1.5 py-2 text-right tabular-nums font-bold text-zinc-900 dark:text-white">
                  {p.points}
                </td>
                <td className="px-1.5 py-2 text-right tabular-nums">{p.reb}</td>
                <td className="px-1.5 py-2 text-right tabular-nums">{p.assists}</td>
                <td className="px-1.5 py-2 text-right tabular-nums">
                  {p.steals ?? "-"}
                </td>
                <td className="px-1.5 py-2 text-right tabular-nums">
                  {p.blocks ?? "-"}
                </td>
                <td className="px-1.5 py-2 text-right tabular-nums text-zinc-600 dark:text-white/70">
                  {p.fgm}-{p.fga}
                </td>
                <td className="px-1.5 py-2 text-right tabular-nums text-zinc-600 dark:text-white/70">
                  {p.tpm}-{p.tpa}
                </td>
                <td className="px-2.5 py-2 text-right tabular-nums text-zinc-600 dark:text-white/70">
                  {p.ftm}-{p.fta}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
