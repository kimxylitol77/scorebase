// /en/teams/[id] — 영어판 팀 상세 (린). 헤더 + 시즌 성적 + 최근/예정 매치 + 로스터.
// 로스터: 축구=ts 공식 스쿼드(team-squads.json, 영문명), MLB=Stats API(선수페이지 링크),
// NHL=공식 API, NBA=정적 인덱스. KBO/NPB 로스터는 한글명이라 v1 미노출(팀 페이지 자체는 지원).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AmbientGlow from "@/components/AmbientGlow";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";
import { GOOGLE_NOINDEX } from "@/lib/seo-robots";
import { calcStandings } from "@/lib/predict/standings";
import { currentSeasonStart, previousSeasonStart } from "@/lib/predict/season-window";
import type { PredictMatch } from "@/lib/predict/types";
import { fetchMlbRoster, type MlbRosterPlayer } from "@/lib/sports/mlb-stats-api";
import { fetchNhlRoster, type NhlRosterPlayer } from "@/lib/sports/nhl-api";
import { getNbaRoster, type NbaRosterPlayer } from "@/lib/sports/nba-players";
import rawTSquads from "../../../../../data/team-squads.json";
import LocalKickoff from "@/components/en/LocalKickoff";
import { enLeagueName, toEnglishTeamName, EN_STANDINGS_LEAGUE_SET } from "@/lib/i18n/en";

export const revalidate = 600;

const T_SQUADS = rawTSquads as Record<
  string,
  { updatedAt: string; squad: Array<{ id: string; name: string; position: string | null; number: number | null }> }
>;

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const teamId = Number(id);
  if (!Number.isFinite(teamId)) return { title: "Not Found", robots: GOOGLE_NOINDEX };
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { name: true, league: true } });
  if (!team) return { title: "Team not found", robots: GOOGLE_NOINDEX };
  const name = toEnglishTeamName(team.name);
  return {
    title: `${name} — Fixtures, Results & Squad`,
    description: `${name} (${enLeagueName(team.league)}) — current form, recent results, upcoming fixtures with AI win probabilities, and squad list.`,
    alternates: {
      canonical: `${SITE_URL}/en/teams/${teamId}`,
      languages: {
        ko: `${SITE_URL}/teams/${teamId}`,
        en: `${SITE_URL}/en/teams/${teamId}`,
        "x-default": `${SITE_URL}/teams/${teamId}`,
      },
    },
  };
}

interface TeamMatchRow {
  id: number;
  startTime: string;
  status: string;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  isHome: boolean;
  result: "W" | "D" | "L" | null;
  predProb: number | null;
  predPickIsThisTeam: boolean | null;
}

interface RosterEntry {
  key: string;
  name: string;
  position: string | null;
  number: number | null;
  href: string | null;
}

function resultOf(m: { homeScore: number | null; awayScore: number | null }, isHome: boolean): "W" | "D" | "L" | null {
  if (m.homeScore == null || m.awayScore == null) return null;
  if (m.homeScore === m.awayScore) return "D";
  const homeWin = m.homeScore > m.awayScore;
  return homeWin === isHome ? "W" : "L";
}

const RESULT_STYLE: Record<string, string> = {
  W: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/30 dark:text-emerald-400",
  D: "bg-neutral-500/10 text-neutral-500 ring-neutral-500/20",
  L: "bg-rose-500/10 text-rose-600 ring-rose-500/30 dark:text-rose-400",
};

function MatchLine({ m }: { m: TeamMatchRow }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        {m.result && (
          <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ring-1 ${RESULT_STYLE[m.result]}`}>
            {m.result}
          </span>
        )}
        <span className="truncate">
          {m.home}{" "}
          <span className="font-bold tabular-nums">
            {m.homeScore != null && m.status !== "SCHEDULED" ? `${m.homeScore}–${m.awayScore}` : "vs"}
          </span>{" "}
          {m.away}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs text-neutral-400">
        {m.predProb != null && m.status === "SCHEDULED" && (
          <span className={m.predPickIsThisTeam ? "font-semibold text-emerald-600 dark:text-emerald-400" : ""}>
            AI {Math.round(m.predProb * 100)}%
          </span>
        )}
        <LocalKickoff iso={m.startTime} />
      </div>
    </div>
  );
}

export default async function EnTeamPage({ params }: Props) {
  const { id } = await params;
  const teamId = Number(id);
  if (!Number.isFinite(teamId)) notFound();

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true, league: true, logoUrl: true, country: true, city: true, venue: true, shortName: true },
  });
  if (!team) notFound();
  const name = toEnglishTeamName(team.name);
  const leagueName = enLeagueName(team.league);

  const [leagueMatches, recent, upcoming] = await Promise.all([
    prisma.match.findMany({
      where: { league: team.league },
      select: {
        id: true, league: true, status: true, homeTeamId: true, awayTeamId: true,
        homeScore: true, awayScore: true, startTime: true,
      },
    }),
    prisma.match.findMany({
      where: { league: team.league, status: "FINISHED", OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
      include: { homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
      orderBy: { startTime: "desc" },
      take: 5,
    }),
    prisma.match.findMany({
      where: { league: team.league, status: "SCHEDULED", OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
      include: { homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
      orderBy: { startTime: "asc" },
      take: 5,
    }),
  ]);

  // 시즌 성적 — ko 팀 페이지와 동일한 시즌 창 규칙 (직전 시즌 폴백 포함)
  const matches: PredictMatch[] = leagueMatches.map((m) => ({ ...m }));
  const seasonStart = currentSeasonStart(team.league);
  let seasonMatches = seasonStart ? matches.filter((m) => m.startTime >= seasonStart) : matches;
  if (seasonStart && seasonMatches.filter((m) => m.status === "FINISHED").length < 10) {
    const prev = previousSeasonStart(seasonStart);
    seasonMatches = matches.filter((m) => m.startTime >= prev && m.startTime < seasonStart);
  }
  const standings = calcStandings(seasonMatches);
  const row = standings.byTeam.get(teamId);

  const toRow = (m: (typeof recent)[number]): TeamMatchRow => {
    const isHome = m.homeTeamId === teamId;
    return {
      id: m.id,
      startTime: m.startTime.toISOString(),
      status: m.status,
      home: toEnglishTeamName(m.homeTeam.name),
      away: toEnglishTeamName(m.awayTeam.name),
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      isHome,
      result: m.status === "FINISHED" ? resultOf(m, isHome) : null,
      predProb: null,
      predPickIsThisTeam: null,
    };
  };
  const recentRows = recent.map(toRow);
  // 예정 매치는 예측 필드 추가 조회 (include 와 select 동시 불가라 별도 로드)
  const upcomingPreds = await prisma.match.findMany({
    where: { id: { in: upcoming.map((m) => m.id) } },
    select: { id: true, predHome: true, predAway: true, predDraw: true, predWinner: true },
  });
  const predById = new Map(upcomingPreds.map((p) => [p.id, p]));
  const upcomingRows = upcoming.map((m) => {
    const r = toRow(m);
    const p = predById.get(m.id);
    if (p?.predWinner) {
      r.predProb = p.predWinner === "HOME" ? p.predHome : p.predWinner === "AWAY" ? p.predAway : p.predDraw;
      r.predPickIsThisTeam =
        (p.predWinner === "HOME" && r.isHome) || (p.predWinner === "AWAY" && !r.isHome);
    }
    return r;
  });

  // 로스터 — 리그별 소스 (영문 원본만)
  let roster: RosterEntry[] = [];
  if (team.league === "MLB") {
    const r: MlbRosterPlayer[] = await fetchMlbRoster(team.name).catch(() => []);
    roster = r.map((p) => ({ key: `mlb-${p.id}`, name: p.name, position: p.position, number: p.number != null ? Number(p.number) : null, href: `/en/players/${p.id}` }));
  } else if (team.league === "NHL" && team.shortName) {
    const dn = new Date();
    const ny = dn.getUTCMonth() + 1 >= 9 ? dn.getUTCFullYear() : dn.getUTCFullYear() - 1;
    const r: NhlRosterPlayer[] = await fetchNhlRoster(team.shortName, `${ny}${ny + 1}`).catch(() => []);
    roster = r.map((p) => ({ key: `nhl-${p.id}`, name: p.name, position: p.position, number: p.number, href: null }));
  } else if (team.league === "NBA") {
    const r: NbaRosterPlayer[] = getNbaRoster(team.name);
    roster = r.map((p) => ({ key: `nba-${p.espnId}`, name: p.name, position: p.pos, number: p.number, href: null }));
  } else {
    // 축구 — ts 공식 스쿼드 (영문명). 이름이 라틴 문자인 항목만.
    const tsRows = await prisma.teamSourceId.findMany({
      where: { source: "thesports", teamId: team.id },
      select: { externalId: true },
    });
    const squad = tsRows.map((t) => T_SQUADS[t.externalId]?.squad).find((sq) => Array.isArray(sq) && sq.length > 0);
    if (squad) {
      roster = squad
        .filter((p) => /^[^가-힣]*$/.test(p.name))
        .map((p) => ({ key: `ts-${p.id}`, name: p.name, position: p.position, number: p.number, href: null }));
    }
  }

  return (
    <main className="relative mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-6">
      <AmbientGlow />
      <header className="space-y-3">
        <nav className="text-xs text-neutral-400">
          {EN_STANDINGS_LEAGUE_SET.has(team.league) ? (
            <Link href={`/en/standings/${team.league}`} className="hover:underline">
              {leagueName}
            </Link>
          ) : (
            leagueName
          )}{" "}
          / {name}
        </nav>
        <div className="flex flex-wrap items-center gap-4">
          {team.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={team.logoUrl} alt={name} width={72} height={72} className="h-18 w-18 shrink-0 object-contain" />
          )}
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{name}</h1>
            <p className="text-sm text-neutral-500">
              {[leagueName, team.country, team.city, team.venue].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
      </header>

      {row && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["Position", `#${row.position}`],
            ["Record", `${row.wins}-${row.draws}-${row.losses}`],
            ["Points", `${row.points}`],
            ["GF", `${row.goalsFor}`],
            ["GA", `${row.goalsAgainst}`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-neutral-200 px-4 py-3 dark:border-white/10">
              <div className="text-[10px] uppercase tracking-wide text-neutral-400">{label}</div>
              <div className="text-xl font-bold tabular-nums">{value}</div>
            </div>
          ))}
        </section>
      )}

      {upcomingRows.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight">Upcoming fixtures</h2>
          <div className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200 dark:divide-white/5 dark:border-white/10">
            {upcomingRows.map((m) => (
              <MatchLine key={m.id} m={m} />
            ))}
          </div>
        </section>
      )}

      {recentRows.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight">Recent results</h2>
          <div className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200 dark:divide-white/5 dark:border-white/10">
            {recentRows.map((m) => (
              <MatchLine key={m.id} m={m} />
            ))}
          </div>
        </section>
      )}

      {roster.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight">
            Squad <span className="text-sm font-normal text-neutral-400">({roster.length})</span>
          </h2>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {roster.map((p) => {
              const inner = (
                <>
                  <span className="w-7 text-center text-xs font-bold tabular-nums text-neutral-400">
                    {p.number ?? "—"}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                  {p.position && <span className="shrink-0 text-xs text-neutral-400">{p.position}</span>}
                </>
              );
              return p.href ? (
                <Link
                  key={p.key}
                  href={p.href}
                  className="flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-sm transition hover:border-neutral-400 dark:border-white/10 dark:hover:border-white/20"
                >
                  {inner}
                </Link>
              ) : (
                <div key={p.key} className="flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-sm dark:border-white/10">
                  {inner}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="border-t border-neutral-200 pt-6 dark:border-white/10">
        <p className="text-sm text-neutral-500">
          Full team hub with articles and history is on the{" "}
          <Link href={`/teams/${team.id}`} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            Korean site
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
