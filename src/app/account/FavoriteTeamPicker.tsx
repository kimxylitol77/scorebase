"use client";

// 대표팀 선택 — 리그 고르면 그 리그 팀 목록을 불러와 클릭 시 저장(setFavoriteTeamAction).
import { useState } from "react";
import { setFavoriteTeamAction } from "./actions";

interface TeamOpt {
  id: number;
  name: string;
  nameKo: string | null;
  logoUrl: string | null;
}

const LEAGUES: { v: string; l: string }[] = [
  { v: "EPL", l: "EPL" },
  { v: "LALIGA", l: "라리가" },
  { v: "BUNDESLIGA", l: "분데스리가" },
  { v: "SERIE_A", l: "세리에 A" },
  { v: "LIGUE_1", l: "리그 1" },
  { v: "WORLD_CUP", l: "국가대표" },
  { v: "MLB", l: "MLB" },
  { v: "KBO", l: "KBO" },
  { v: "NPB", l: "NPB" },
  { v: "NBA", l: "NBA" },
  { v: "NHL", l: "NHL" },
];

export default function FavoriteTeamPicker() {
  const [league, setLeague] = useState("");
  const [teams, setTeams] = useState<TeamOpt[]>([]);
  const [loading, setLoading] = useState(false);

  async function onLeague(v: string) {
    setLeague(v);
    if (!v) {
      setTeams([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/teams/by-league?league=${v}`);
      const data = (await res.json()) as { teams: TeamOpt[] };
      setTeams(data.teams ?? []);
    } catch {
      setTeams([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2">
      <select
        value={league}
        onChange={(e) => onLeague(e.target.value)}
        className="w-full rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
      >
        <option value="">리그 선택…</option>
        {LEAGUES.map((lg) => (
          <option key={lg.v} value={lg.v}>
            {lg.l}
          </option>
        ))}
      </select>

      {loading ? (
        <p className="mt-2 text-center text-[11px] text-neutral-400">불러오는 중…</p>
      ) : teams.length > 0 ? (
        <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-black/5 dark:border-white/10">
          {teams.map((t) => (
            <form key={t.id} action={setFavoriteTeamAction}>
              <input type="hidden" name="teamId" value={t.id} />
              <button
                type="submit"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-white/[0.05] transition-colors"
              >
                {t.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.logoUrl} alt="" className="h-5 w-5 shrink-0 rounded-sm object-contain" loading="lazy" />
                ) : (
                  <span className="h-5 w-5 shrink-0" />
                )}
                <span className="truncate">{t.nameKo ?? t.name}</span>
              </button>
            </form>
          ))}
        </div>
      ) : null}
    </div>
  );
}
