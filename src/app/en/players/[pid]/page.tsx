// /en/players/[pid] — 영어판 선수 상세 (린). MLB(기본)=MLB Stats API 타자/투수,
// ?league=축구코드=api-football 프로필. 소스가 영문 원본이라 변환 없이 노출.
// KBO/NPB(한국어 스크랩)·NBA/NHL/LOL(전용 뷰 미이식)은 v1 미지원 → 404.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AmbientGlow from "@/components/AmbientGlow";
import { SITE_URL } from "@/lib/site-url";
import { GOOGLE_NOINDEX } from "@/lib/seo-robots";
import {
  fetchHitterProfile,
  fetchHitterRecent,
  fetchPitcherProfile,
  fetchPitcherRecent,
  type HitterProfile,
  type PitcherProfile,
  type HitterRecentGame,
  type PitcherRecentGame,
} from "@/lib/sports/mlb-stats-api";
import { fetchSoccerPlayerProfile } from "@/lib/sports/api-football-pro";
import { SOCCER_LEAGUES } from "@/lib/sports/types";
import { enLeagueName } from "@/lib/i18n/en";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ pid: string }>;
  searchParams: Promise<{ league?: string }>;
}

const SOCCER_SET = new Set<string>(SOCCER_LEAGUES);

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { pid } = await params;
  const { league } = await searchParams;
  const suffix = league && league !== "MLB" ? `?league=${league}` : "";
  const canonical = `${SITE_URL}/en/players/${pid}${suffix}`;
  const koUrl = `${SITE_URL}/players/${pid}${suffix}`;
  const alternates = {
    canonical,
    languages: { ko: koUrl, en: canonical, "x-default": koUrl },
  };
  if (league && SOCCER_SET.has(league)) {
    return {
      title: `Player Profile — ${enLeagueName(league)}`,
      description: `${enLeagueName(league)} player profile, season statistics and per-competition breakdown.`,
      alternates,
    };
  }
  const id = Number(pid);
  if (!Number.isFinite(id) || (league && league !== "MLB")) return { title: "Not Found", robots: GOOGLE_NOINDEX };
  const yr = new Date().getUTCFullYear();
  try {
    const profile = await fetchHitterProfile(id, yr);
    if (!profile) return { title: "Player not found", robots: GOOGLE_NOINDEX };
    const isPitcher = profile.position === "P";
    return {
      title: `${profile.name} — MLB ${isPitcher ? "Pitcher" : "Hitter"} Stats`,
      description: isPitcher
        ? `${profile.team ?? "MLB"} — ${profile.name}'s ${yr} ERA, WHIP, K/9 and recent starts.`
        : `${profile.team ?? "MLB"} — ${profile.name}'s ${yr} batting average, home runs, RBIs, OPS and recent games.`,
      alternates,
    };
  } catch {
    return { title: "Player not found", robots: GOOGLE_NOINDEX };
  }
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${accent ? "border border-blue-200 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/10" : "bg-neutral-50 dark:bg-white/[0.04]"}`}>
      <div className="text-[10px] text-neutral-500">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

const s = (v: number | string | undefined | null) => (v == null ? "—" : String(v));
const f2 = (v: number | undefined) => (v == null || Number.isNaN(v) ? "—" : v.toFixed(2));

function PlayerHeader({
  name,
  sub,
  tag,
  backHref,
  backLabel,
}: {
  name: string;
  sub: string;
  tag: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <header className="space-y-3">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-blue-600 ring-1 ring-blue-500/20 dark:text-blue-400"
      >
        ← {backLabel}
      </Link>
      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{name}</h1>
          <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
            {tag}
          </span>
        </div>
        <p className="text-sm text-neutral-500">{sub}</p>
      </div>
    </header>
  );
}

function MlbHitterEn({ profile, recent, season }: { profile: HitterProfile; recent: HitterRecentGame[]; season: number }) {
  const st = profile.season;
  return (
    <article className="relative mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6">
      <AmbientGlow />
      <PlayerHeader
        name={profile.name}
        sub={[profile.team, profile.position, profile.age ? `${profile.age} yrs` : null, profile.bats ? `Bats ${profile.bats}` : null].filter(Boolean).join(" · ")}
        tag="MLB"
        backHref="/en/standings/MLB"
        backLabel="MLB"
      />
      {st && (
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">{season} season batting</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            <Stat label="AVG" value={s(st.avg)} accent />
            <Stat label="HR" value={s(st.hr)} accent />
            <Stat label="RBI" value={s(st.rbi)} />
            <Stat label="OPS" value={s(st.ops)} />
            <Stat label="OBP" value={s(st.obp)} />
            <Stat label="SLG" value={s(st.slg)} />
            <Stat label="Games" value={s(st.games)} />
            <Stat label="Hits" value={s(st.hits)} />
            <Stat label="Runs" value={s(st.runs)} />
            <Stat label="SB" value={s(st.sb)} />
            <Stat label="BB" value={s(st.bb)} />
            <Stat label="SO" value={s(st.so)} />
          </div>
        </section>
      )}
      {recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Recent games</h2>
          <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-white/10">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-[11px] uppercase tracking-wide text-neutral-400 dark:border-white/10">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Opp</th>
                  <th className="px-2 py-2 text-center">AB</th>
                  <th className="px-2 py-2 text-center">H</th>
                  <th className="px-2 py-2 text-center">HR</th>
                  <th className="px-2 py-2 text-center">RBI</th>
                  <th className="px-2 py-2 text-center">R</th>
                  <th className="px-2 py-2 text-center">AVG</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((g) => (
                  <tr key={g.date + g.opponent} className="border-b border-neutral-100 last:border-0 dark:border-white/5">
                    <td className="px-3 py-2 tabular-nums text-neutral-500">{g.date.slice(5)}</td>
                    <td className="px-3 py-2">{g.isHome ? "vs" : "@"} {g.opponent}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{g.ab}</td>
                    <td className="px-2 py-2 text-center tabular-nums font-semibold">{g.h}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{g.hr}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{g.rbi}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{g.r}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-neutral-500">{g.avg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <p className="text-[11px] text-neutral-500">Data: MLB Stats API (statsapi.mlb.com), refreshed on load.</p>
    </article>
  );
}

function MlbPitcherEn({ profile, recent, season }: { profile: PitcherProfile; recent: PitcherRecentGame[]; season: number }) {
  const st = profile.season;
  return (
    <article className="relative mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6">
      <AmbientGlow />
      <PlayerHeader
        name={profile.name}
        sub={[profile.team, profile.hand ? `Throws ${profile.hand}` : null, profile.age ? `${profile.age} yrs` : null].filter(Boolean).join(" · ")}
        tag="MLB · P"
        backHref="/en/standings/MLB"
        backLabel="MLB"
      />
      {st && (
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">{season} season pitching</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            <Stat label="ERA" value={f2(st.era)} accent />
            <Stat label="WHIP" value={f2(st.whip)} accent />
            <Stat label="K/9" value={f2(st.k9)} />
            <Stat label="W-L" value={`${s(st.wins)}-${s(st.losses)}`} />
            <Stat label="IP" value={s(st.ip)} />
            <Stat label="SO" value={s(st.so)} />
          </div>
        </section>
      )}
      {recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Recent starts</h2>
          <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-white/10">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-[11px] uppercase tracking-wide text-neutral-400 dark:border-white/10">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Opp</th>
                  <th className="px-2 py-2 text-center">IP</th>
                  <th className="px-2 py-2 text-center">ER</th>
                  <th className="px-2 py-2 text-center">SO</th>
                  <th className="px-2 py-2 text-center">BB</th>
                  <th className="px-2 py-2 text-center">Dec</th>
                  <th className="px-2 py-2 text-center">ERA</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((g) => (
                  <tr key={g.date + g.opponent} className="border-b border-neutral-100 last:border-0 dark:border-white/5">
                    <td className="px-3 py-2 tabular-nums text-neutral-500">{g.date.slice(5)}</td>
                    <td className="px-3 py-2">{g.isHome ? "vs" : "@"} {g.opponent}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{g.ip}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{g.er}</td>
                    <td className="px-2 py-2 text-center tabular-nums font-semibold">{g.so}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{g.bb}</td>
                    <td className="px-2 py-2 text-center font-semibold">{g.decision ?? "—"}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-neutral-500">{g.era}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <p className="text-[11px] text-neutral-500">Data: MLB Stats API (statsapi.mlb.com), refreshed on load.</p>
    </article>
  );
}

async function SoccerPlayerEn({ pid, league }: { pid: string; league: string }) {
  const id = Number(pid);
  if (!Number.isFinite(id)) notFound();
  const now = new Date();
  const season = now.getUTCMonth() + 1 >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const profile = await fetchSoccerPlayerProfile(id, season);
  if (!profile) notFound();
  const main = profile.stats[0];
  return (
    <article className="relative mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6">
      <AmbientGlow />
      <PlayerHeader
        name={profile.name}
        sub={[main?.teamName, profile.position, profile.age ? `${profile.age} yrs` : null, profile.nationality].filter(Boolean).join(" · ")}
        tag={enLeagueName(league)}
        backHref={`/en/standings/${league}`}
        backLabel={enLeagueName(league)}
      />
      {main && (
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
            {main.leagueName} — season totals
          </h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            <Stat label="Apps" value={s(main.appearances)} accent />
            <Stat label="Goals" value={s(main.goals ?? 0)} accent />
            <Stat label="Assists" value={s(main.assists ?? 0)} />
            <Stat label="Rating" value={main.rating ? Number(main.rating).toFixed(2) : "—"} />
            <Stat label="Minutes" value={s(main.minutes)} />
            <Stat label="Starts" value={s(main.lineups)} />
          </div>
        </section>
      )}
      {profile.stats.length > 1 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">By competition</h2>
          <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-white/10">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-[11px] uppercase tracking-wide text-neutral-400 dark:border-white/10">
                  <th className="px-3 py-2">Competition</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-2 py-2 text-center">Apps</th>
                  <th className="px-2 py-2 text-center">Goals</th>
                  <th className="px-2 py-2 text-center">Assists</th>
                  <th className="px-2 py-2 text-center">Rating</th>
                </tr>
              </thead>
              <tbody>
                {profile.stats.map((st, i) => (
                  <tr key={i} className="border-b border-neutral-100 last:border-0 dark:border-white/5">
                    <td className="max-w-[200px] truncate px-3 py-2">{st.leagueName}</td>
                    <td className="max-w-[160px] truncate px-3 py-2">{st.teamName}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{st.appearances ?? "—"}</td>
                    <td className="px-2 py-2 text-center tabular-nums font-semibold">{st.goals ?? 0}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{st.assists ?? 0}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{st.rating ? Number(st.rating).toFixed(2) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <p className="text-[11px] text-neutral-500">Data: API-Football (api-sports.io), refreshed daily.</p>
    </article>
  );
}

export default async function EnPlayerPage({ params, searchParams }: Props) {
  const { pid } = await params;
  const { league } = await searchParams;

  if (league && SOCCER_SET.has(league)) return <SoccerPlayerEn pid={pid} league={league} />;
  if (league && league !== "MLB") notFound();

  const id = Number(pid);
  if (!Number.isFinite(id)) notFound();
  const season = new Date().getUTCFullYear();
  let hitter: Awaited<ReturnType<typeof fetchHitterProfile>> = null;
  try {
    hitter = await fetchHitterProfile(id, season);
  } catch {
    hitter = null;
  }
  if (!hitter) notFound();
  if (hitter.position !== "P") {
    return <MlbHitterEn profile={hitter} recent={await fetchHitterRecent(id, season, 10)} season={season} />;
  }
  const [profile, recent] = await Promise.all([
    fetchPitcherProfile(id, season),
    fetchPitcherRecent(id, season, 10),
  ]);
  if (!profile) notFound();
  return <MlbPitcherEn profile={profile} recent={recent} season={season} />;
}
