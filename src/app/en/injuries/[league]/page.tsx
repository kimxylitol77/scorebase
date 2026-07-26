// /en/injuries/[league] — 영어판 부상자 명단. 소스가 영문 원본이라 변환 없이 노출 —
// 축구=api-football 시즌 부상(+현 스쿼드 필터), NBA/MLB/NHL=ESPN. KBO/NPB 는 한국어
// 소스(공식 등록·말소 공시)라 v1 제외. ko 페이지의 TheSports 1순위 오버레이는 미사용(린 버전).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import AmbientGlow from "@/components/AmbientGlow";
import { SITE_URL } from "@/lib/site-url";
import {
  fetchSeasonInjuries,
  filterInjuriesToCurrentSquad,
  getApiFootballSeason,
  type InjuryEntry,
} from "@/lib/sports/api-football-pro";
import { fetchEspnInjuries, type EspnInjuryEntry } from "@/lib/sports/espn-injuries";
import {
  enLeagueName,
  EN_INJURY_SOCCER as SOCCER_EN,
  EN_INJURY_ESPN as ESPN_EN,
  EN_INJURY_LEAGUE_SET as VALID,
} from "@/lib/i18n/en";

export const revalidate = 900;

interface Props {
  params: Promise<{ league: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { league } = await params;
  const upper = league.toUpperCase();
  if (!VALID.has(upper)) return {};
  const name = enLeagueName(upper);
  return {
    title: `${name} Injury List — Who's Out & Why`,
    description: `Current ${name} injuries and absences by team — player, reason and latest status, refreshed throughout the day.`,
    alternates: {
      canonical: `${SITE_URL}/en/injuries/${upper}`,
      languages: {
        ko: `${SITE_URL}/injuries/${upper}`,
        en: `${SITE_URL}/en/injuries/${upper}`,
        "x-default": `${SITE_URL}/injuries/${upper}`,
      },
    },
  };
}

// af 시즌 부상 — ko 페이지와 별도 키의 공유 캐시 (15분, af 일 한도 보호)
const fetchSoccerInjuriesCached = unstable_cache(
  async (league: string) => {
    const season = getApiFootballSeason(new Date(), league);
    let entries = await fetchSeasonInjuries(league, season);
    if (entries.length > 0) entries = await filterInjuriesToCurrentSquad(entries);
    return entries;
  },
  ["en-injuries-af-season"],
  { revalidate: 900 },
);

interface EnInjuryRow {
  player: string;
  reason: string;
  status: string | null;
  team: string;
  date: string | null;
}

// 시즌 누적 af 목록 → 선수별 최신 1건, 최근 60일 내 보고만 (복귀·이적 잔존 축소)
function toActiveSoccerRows(entries: InjuryEntry[]): EnInjuryRow[] {
  const latestByPlayer = new Map<number, InjuryEntry>();
  for (const e of entries) {
    const cur = latestByPlayer.get(e.playerId);
    if (!cur || (e.fixtureDate ?? "") > (cur.fixtureDate ?? "")) latestByPlayer.set(e.playerId, e);
  }
  const cutoff = new Date(Date.now() - 60 * 86400000).toISOString();
  return Array.from(latestByPlayer.values())
    .filter((e) => !e.fixtureDate || e.fixtureDate >= cutoff)
    .map((e) => ({
      player: e.playerName,
      reason: e.reason,
      status: e.type || null,
      team: e.teamName,
      date: e.fixtureDate ?? null,
    }));
}

function toEspnRows(entries: EspnInjuryEntry[]): EnInjuryRow[] {
  return entries.map((e) => ({
    player: e.playerName,
    reason: e.reason,
    status: e.status || null,
    team: e.teamName,
    date: e.fixtureDate ?? null,
  }));
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(d);
}

export default async function EnInjuriesLeague({ params }: Props) {
  const { league } = await params;
  const upper = league.toUpperCase();
  if (!VALID.has(upper)) notFound();
  const name = enLeagueName(upper);

  let rows: EnInjuryRow[] = [];
  if ((ESPN_EN as readonly string[]).includes(upper)) {
    rows = toEspnRows(await fetchEspnInjuries(upper as "NBA" | "MLB" | "NHL").catch(() => []));
  } else {
    rows = toActiveSoccerRows(await fetchSoccerInjuriesCached(upper).catch(() => []));
  }

  // 팀별 그룹
  const byTeam = new Map<string, EnInjuryRow[]>();
  for (const r of rows) {
    if (!byTeam.has(r.team)) byTeam.set(r.team, []);
    byTeam.get(r.team)!.push(r);
  }
  const teamsSorted = Array.from(byTeam.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <main className="relative mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-6">
      <AmbientGlow />
      <header className="space-y-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400">
          Injuries
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{name} injury list</h1>
        <p className="text-sm leading-relaxed text-neutral-500">
          Players currently sidelined or doubtful, grouped by team.{" "}
          {(ESPN_EN as readonly string[]).includes(upper)
            ? "Official injury-report designations (Out, Day-To-Day, Injured Reserve)."
            : "Recently reported absences from match-day squads; returned players drop off automatically."}
        </p>
      </header>

      {/* 리그 전환 칩 */}
      <nav className="flex flex-wrap gap-2 text-sm">
        {[...SOCCER_EN, ...ESPN_EN].map((lg) => (
          <Link
            key={lg}
            href={`/en/injuries/${lg}`}
            prefetch={false}
            className={
              lg === upper
                ? "rounded-full bg-neutral-900 px-3 py-1.5 font-semibold text-white dark:bg-white dark:text-neutral-900"
                : "rounded-full bg-white/60 px-3 py-1.5 font-medium text-neutral-600 ring-1 ring-black/10 backdrop-blur transition hover:bg-white dark:bg-white/5 dark:text-neutral-300 dark:ring-white/15 dark:hover:bg-white/10"
            }
          >
            {enLeagueName(lg)}
          </Link>
        ))}
      </nav>

      {teamsSorted.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500 dark:border-white/15">
          No injuries currently reported for {name} — or the source has no fresh data (off-season).
        </p>
      ) : (
        <div className="space-y-4">
          {teamsSorted.map(([team, list]) => (
            <section key={team} className="overflow-hidden rounded-2xl border border-neutral-200 dark:border-white/10">
              <h2 className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-sm font-bold dark:border-white/10 dark:bg-white/[0.03]">
                {team} <span className="font-normal text-neutral-400">({list.length})</span>
              </h2>
              <div className="divide-y divide-neutral-100 dark:divide-white/5">
                {list.map((r, i) => (
                  <div key={`${r.player}-${i}`} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium">{r.player}</span>
                      <span className="ml-2 text-xs text-neutral-500">{r.reason}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs text-neutral-400">
                      {r.status && (
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400">
                          {r.status}
                        </span>
                      )}
                      {fmtDate(r.date) && <span>{fmtDate(r.date)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <section className="border-t border-neutral-200 pt-6 dark:border-white/10">
        <p className="text-sm text-neutral-500">
          Injuries feed straight into our{" "}
          <Link href={`/en/predictions/${upper}`} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            match predictions
          </Link>{" "}
          via lineup strength. KBO and NPB injury lists are available on the{" "}
          <Link href="/injuries/KBO" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            Korean site
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
