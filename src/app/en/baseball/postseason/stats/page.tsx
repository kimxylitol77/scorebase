// 영어판 야구 포스트시즌 선수 통계 — 한국어 /baseball/postseason/stats 와 같은 데이터·규정, 화면 문구와 열 설명만 영어.
// 선수명은 nameEn 우선(KBO·NPB 아카이브는 없을 수 있어 원래 이름), 팀명은 영문. MLB 만 영어 선수 페이지가 있어 KBO·NPB 는 한국어 선수 페이지로 잇는다.
import type { Metadata } from "next";
import { breadcrumbLd, datasetLd } from "@/lib/seo/jsonld";
import StatsExplorer from "@/components/stats/StatsExplorer";
import { BB_LEAGUES, type BbLeague, type BbPlayerRow, type BbRole } from "@/lib/sports/baseball/player-rankings";
import { buildStatRows, columnsFor, type StatRow } from "@/lib/sports/baseball/stats-table";
import { enStatColumns } from "@/lib/sports/baseball/stats-cols-en";
import { canonicalOf, parse, resolveSeason } from "@/lib/sports/baseball/postseason-stats-page";
import { koEnLanguages, toEnglishTeamName } from "@/lib/i18n/en";
import { kboPhotoUrl } from "@/lib/sports/kbo-official";
import { npbPlayerPhoto } from "@/lib/sports/npb-player-ko";

export const dynamic = "force-dynamic";

const PATH = "/en/baseball/postseason/stats";
const KO_PATH = "/baseball/postseason/stats";
const ROLE_EN: Record<BbRole, string> = { bat: "batting", pit: "pitching" };
type SP = Record<string, string | undefined>;

const ROUNDS: Record<BbLeague, string> = { MLB: "Wild Card to World Series", KBO: "Wild Card to Korean Series", NPB: "Climax Series and Japan Series" };
const SOURCE: Record<BbLeague, string> = {
  MLB: "MLB Stats API postseason splits (refreshed every 10 minutes)",
  KBO: "KBO official records by series (Wild Card, semi-playoff, playoff, Korean Series) summed per player, refreshed daily in October. OBP uses (AB + BB + HBP) without sacrifice flies, so it can differ slightly from the official figure",
  NPB: "npb.jp box scores of Climax Series and Japan Series games summed per player, refreshed daily in October. OBP uses (AB + BB + HBP) without sacrifice flies, so it can differ slightly from the official figure",
};

/** 영문 이름·영문 팀명으로 바꾼 행 — 팀 칩·검색·부제가 전부 영어가 된다 */
const toEn = (rows: BbPlayerRow[]): BbPlayerRow[] => rows.map((r) => ({ ...r, name: r.nameEn ?? r.name, team: toEnglishTeamName(r.team) }));

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams;
  const { league, role } = parse(sp);
  const { season, latest } = await resolveSeason(league, sp);
  const head = role === "bat" ? "AVG, HR and OPS" : "ERA and strikeouts";
  const enPath = canonicalOf(league, season, latest, role, PATH);
  return {
    title: `${season} ${league} postseason ${ROLE_EN[role]} stats — ${head} leaders`,
    description: `Every ${league} player's ${season} postseason ${ROLE_EN[role]} stats (${ROUNDS[league]}). Sort ${head}, search players and see postseason percentiles for each stat.`,
    alternates: { canonical: enPath, languages: koEnLanguages(canonicalOf(league, season, latest, role, KO_PATH), enPath) },
    openGraph: { title: `${season} ${league} postseason ${ROLE_EN[role]} stats`, description: `${ROUNDS[league]} ${ROLE_EN[role]} stats and percentiles in one table.` },
  };
}

export default async function EnPostseasonStatsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { league, role, unit } = parse(sp);
  const { current, latest, seasons, season, data } = await resolveSeason(league, sp);
  const path = canonicalOf(league, season, latest, role, PATH);
  const cols = enStatColumns(columnsFor(role, league));
  const built = data
    ? buildStatRows(toEn(role === "bat" ? data.bat : data.pit), role, unit, cols, data.adv, data.minIp)
    : { rows: [], qualifiedCount: 0, minGames: 0 };
  const decorate = (r: StatRow) => ({
    photo: league === "KBO" && r.externalId ? kboPhotoUrl(r.externalId) : league === "MLB" && r.externalId ? `https://midfield.mlbstatic.com/v1/people/${r.externalId}/spots/120` : league === "NPB" && r.logId ? npbPlayerPhoto(r.logId) ?? null : null,
    href: league === "MLB" && r.externalId ? `/en/players/${r.externalId}` : league === "KBO" && r.externalId ? `/players/${r.externalId}?league=KBO` : league === "NPB" && r.logId ? `/players/${r.logId}?league=NPB` : null,
    sub: r.team,
  });
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (v) params[k] = v;
  const rule = role === "bat" ? `at least half the most games played (${built.minGames} G)` : `at least a quarter of the most innings (${data?.minIp ?? 1} IP)`;
  const lead = !data
    ? `Couldn't load ${league} postseason stats. Please check back shortly.`
    : latest !== current && season === latest
      ? `The ${current} postseason hasn't started yet, so these are ${season} postseason stats. A ${current} button appears after the first game; ${season} stays available from the season buttons.`
      : `${season} ${league} postseason (${ROUNDS[league]}).`;
  return (
    <StatsExplorer
      lang="en"
      basePath={PATH}
      jsonLd={[
        breadcrumbLd([{ name: "Home", path: "/en" }, { name: "Standings", path: `/en/standings/${league}` }, { name: "Postseason stats", path: PATH }, { name: `${season} ${league} postseason ${ROLE_EN[role]} stats`, path }]),
        datasetLd({ name: `${season} ${league} postseason ${ROLE_EN[role]} stats`, description: `${season} ${league} postseason ${ROLE_EN[role]} stats for ${built.rows.length} players with postseason percentiles (${built.qualifiedCount} qualified).`, path, variableMeasured: cols.map((c) => c.label), temporalCoverage: String(season) }),
      ]}
      eyebrow={`${league} Postseason ${season}`}
      title={`${season} ${league} postseason player stats`}
      subtitle={`${lead} The small number under each cell is the percentile among qualified postseason players (higher is better; for ERA, WHIP, losses and similar, lower is better). Qualified = ${rule} (${built.qualifiedCount} players).`}
      links={[
        { href: `/en/standings/${league}`, label: `${league} standings` },
        { href: KO_PATH + `?league=${league}`, label: "한국어" },
      ]}
      pills={[
        { param: "league", options: BB_LEAGUES.map((l) => ({ value: l, label: l })), value: league, resets: ["season", "team", "cmp"] },
        { param: "season", options: seasons.map((y) => ({ value: String(y), label: String(y) })), value: String(season), resets: ["team", "cmp"] },
        { param: "role", options: [{ value: "bat", label: "Batting" }, { value: "pit", label: "Pitching" }], value: role },
        { param: "unit", options: [{ value: "total", label: "Totals" }, { value: "pergame", label: "Per game" }], value: unit },
      ]}
      params={{ ...params, league, season: String(season), role, unit }}
      cols={cols}
      rows={built.rows}
      unit={unit}
      decorate={decorate}
      defaultSort={role === "bat" ? "ops" : "era"}
      scatterDefault={role === "bat" ? { x: "avg", y: "ops" } : { x: "era", y: "whip" }}
      qualifiedCount={built.qualifiedCount}
      glossaryNote={`Percentile = share of qualified players in the same postseason and role with a worse value (${built.qualifiedCount} players); ties count half. Postseason samples are short, so one or two games can swing them a lot.`}
      corner={`${season} · ${league} PS`}
      footnote={`Source: ${SOURCE[league]}. Totals cover ${ROUNDS[league]} only; regular-season stats are not included. The regular-season qualifier (30 IP) doesn't fit October, so batters need half the most games played and pitchers a quarter of the most innings; players below that stay in the table without percentiles.${league === "MLB" ? " Advanced columns wOBA (FanGraphs linear weights), ISO, BB%, K% / FIP (constant 3.15), K%, BB%, HR/9 are computed from the same postseason components." : ""}`}
    />
  );
}
