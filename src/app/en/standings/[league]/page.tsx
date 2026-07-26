// /en/standings/[league] — 영어판 리그 순위표. 소스는 ko 와 동일 체계 —
// 축구=getFullStandings(ts/af), 야구=fetchBaseballTable(공식)→calcStandings(DB 매치) 폴백.
// 야구는 승률(PCT)·게임차(GB) 컬럼, 그 외는 승점 테이블. 팀명은 영문(DB 원본 + 한→영 매핑).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import AmbientGlow from "@/components/AmbientGlow";
import { SITE_URL } from "@/lib/site-url";
import { getFullStandings, type StandingsRow } from "@/lib/sports/thesports/standings-helper";
import { fetchBaseballTable } from "@/lib/sports/thesports/baseball-table";
import { calcStandings } from "@/lib/predict/standings";
import { currentSeasonStart, previousSeasonStart } from "@/lib/predict/season-window";
import {
  enLeagueName,
  toEnglishTeamName,
  BASEBALL_LEAGUES_EN,
  EN_PREDICTION_LEAGUE_SET,
  EN_STANDINGS_LEAGUE_SET as VALID,
} from "@/lib/i18n/en";

export const revalidate = 600;

interface Props {
  params: Promise<{ league: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { league } = await params;
  const upper = league.toUpperCase();
  if (!VALID.has(upper)) return {};
  const name = enLeagueName(upper);
  return {
    title: `${name} Standings — Full Table`,
    description: `Current ${name} standings with wins, losses, points and goal difference — updated throughout the day.`,
    alternates: {
      canonical: `${SITE_URL}/en/standings/${upper}`,
      languages: {
        ko: `${SITE_URL}/standings/${upper}`,
        en: `${SITE_URL}/en/standings/${upper}`,
        "x-default": `${SITE_URL}/standings/${upper}`,
      },
    },
  };
}

function StandingsTable({
  rows,
  nameById,
  isBaseball,
}: {
  rows: StandingsRow[];
  nameById: Map<number, string>;
  isBaseball: boolean;
}) {
  const sorted = [...rows].sort((a, b) => a.position - b.position || b.points - a.points);
  // 야구 게임차 — 선두 대비 ((선두승-승)+(패-선두패))/2
  const leader = sorted[0];
  const gb = (r: StandingsRow) =>
    leader ? ((leader.won - r.won + (r.loss - leader.loss)) / 2).toFixed(1).replace(/\.0$/, "") : "-";
  const hasDraws = sorted.some((r) => r.draw > 0);

  return (
    <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-white/10">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-[11px] uppercase tracking-wide text-neutral-400 dark:border-white/10">
            <th className="px-3 py-2.5 w-10 text-center">#</th>
            <th className="px-3 py-2.5">Team</th>
            <th className="px-2 py-2.5 text-center">GP</th>
            <th className="px-2 py-2.5 text-center">W</th>
            {(!isBaseball || hasDraws) && <th className="px-2 py-2.5 text-center">{isBaseball ? "T" : "D"}</th>}
            <th className="px-2 py-2.5 text-center">L</th>
            {isBaseball ? (
              <>
                <th className="px-2 py-2.5 text-center">PCT</th>
                <th className="px-2 py-2.5 text-center">GB</th>
              </>
            ) : (
              <>
                {sorted.some((r) => r.goalsFor != null) && (
                  <>
                    <th className="hidden px-2 py-2.5 text-center sm:table-cell">GF</th>
                    <th className="hidden px-2 py-2.5 text-center sm:table-cell">GA</th>
                    <th className="px-2 py-2.5 text-center">GD</th>
                  </>
                )}
                <th className="px-2 py-2.5 text-center font-bold">Pts</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const games = r.won + r.draw + r.loss;
            const pctVal = r.won + r.loss > 0 ? (r.won / (r.won + r.loss)).toFixed(3).replace(/^0/, "") : "-";
            return (
              <tr
                key={`${r.teamId}-${r.position}`}
                className="border-b border-neutral-100 last:border-0 dark:border-white/5"
              >
                <td className="px-3 py-2 text-center font-bold tabular-nums text-neutral-400">{r.position}</td>
                <td className="px-3 py-2 font-medium">{nameById.get(r.teamId) ?? `Team ${r.teamId}`}</td>
                <td className="px-2 py-2 text-center tabular-nums text-neutral-500">{games}</td>
                <td className="px-2 py-2 text-center tabular-nums">{r.won}</td>
                {(!isBaseball || hasDraws) && (
                  <td className="px-2 py-2 text-center tabular-nums text-neutral-500">{r.draw}</td>
                )}
                <td className="px-2 py-2 text-center tabular-nums">{r.loss}</td>
                {isBaseball ? (
                  <>
                    <td className="px-2 py-2 text-center tabular-nums font-semibold">{pctVal}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-neutral-500">
                      {r.position === leader?.position ? "-" : gb(r)}
                    </td>
                  </>
                ) : (
                  <>
                    {sorted.some((x) => x.goalsFor != null) && (
                      <>
                        <td className="hidden px-2 py-2 text-center tabular-nums text-neutral-500 sm:table-cell">
                          {r.goalsFor ?? "-"}
                        </td>
                        <td className="hidden px-2 py-2 text-center tabular-nums text-neutral-500 sm:table-cell">
                          {r.goalsAgainst ?? "-"}
                        </td>
                        <td className="px-2 py-2 text-center tabular-nums text-neutral-500">
                          {r.goalDiff != null && r.goalDiff > 0 ? `+${r.goalDiff}` : (r.goalDiff ?? "-")}
                        </td>
                      </>
                    )}
                    <td className="px-2 py-2 text-center font-bold tabular-nums">{r.points}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// 야구 — 공식 순위(fetchBaseballTable) → ts/af 캐시(getFullStandings) → DB 매치 calcStandings 순 폴백.
async function fetchBaseballRows(upper: string): Promise<StandingsRow[]> {
  const bb = await fetchBaseballTable(upper).catch(() => []);
  if (bb.length > 0) {
    return bb.map((r) => ({
      teamId: r.ourTeamId,
      position: r.position,
      points: r.wins * 3,
      won: r.wins,
      draw: r.draws,
      loss: r.losses,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
      goalDiff: r.goalsFor - r.goalsAgainst,
    }));
  }
  const cached = await getFullStandings(upper).catch(() => [] as StandingsRow[]);
  if (cached.length > 0) return cached;
  const allMatches = await prisma.match.findMany({
    where: { league: upper },
    select: {
      id: true,
      league: true,
      status: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      startTime: true,
    },
  });
  const seasonStart = currentSeasonStart(upper);
  let matches = seasonStart ? allMatches.filter((m) => m.startTime >= seasonStart) : allMatches;
  if (seasonStart && matches.filter((m) => m.status === "FINISHED").length < 10) {
    const prev = previousSeasonStart(seasonStart);
    matches = allMatches.filter((m) => m.startTime >= prev && m.startTime < seasonStart);
  }
  if (matches.length === 0) return [];
  return calcStandings(matches).rows.map((r) => ({
    teamId: r.teamId,
    position: r.position,
    points: r.points,
    won: r.wins,
    draw: r.draws,
    loss: r.losses,
    goalsFor: r.goalsFor,
    goalsAgainst: r.goalsAgainst,
    goalDiff: r.goalDiff,
  }));
}

export default async function EnStandingsLeague({ params }: Props) {
  const { league } = await params;
  const upper = league.toUpperCase();
  if (!VALID.has(upper)) notFound();

  const rows = BASEBALL_LEAGUES_EN.has(upper)
    ? await fetchBaseballRows(upper)
    : await getFullStandings(upper).catch(() => [] as StandingsRow[]);
  if (rows.length === 0) notFound();

  const teams = await prisma.team.findMany({
    where: { id: { in: rows.map((r) => r.teamId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(teams.map((t) => [t.id, toEnglishTeamName(t.name)]));

  const name = enLeagueName(upper);
  const isBaseball = BASEBALL_LEAGUES_EN.has(upper);
  // J1/J2 100년 비전 등 그룹 포맷 — group 별 분리 렌더
  const groups = new Map<string, StandingsRow[]>();
  for (const r of rows) {
    const g = r.group ?? "";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(r);
  }

  return (
    <main className="relative mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <AmbientGlow />
      <header className="space-y-2">
        <nav className="text-xs text-neutral-400">
          <Link href="/en/standings" className="hover:underline">
            Standings
          </Link>{" "}
          / {name}
        </nav>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{name} standings</h1>
        <p className="text-sm text-neutral-500">
          Updated throughout the day.
          {EN_PREDICTION_LEAGUE_SET.has(upper) && (
            <>
              {" "}
              See{" "}
              <Link
                href={`/en/predictions/${upper}`}
                className="font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                {name} AI predictions
              </Link>
              .
            </>
          )}
        </p>
      </header>

      {Array.from(groups.entries()).map(([g, groupRows]) => (
        <section key={g || "main"} className="space-y-2">
          {g && <h2 className="text-lg font-bold tracking-tight">{g}</h2>}
          <StandingsTable rows={groupRows} nameById={nameById} isBaseball={isBaseball} />
        </section>
      ))}
    </main>
  );
}
