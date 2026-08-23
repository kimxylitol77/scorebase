// /en/over-under/[league] — 리그별 팀 오버/언더 표 (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  getLeagueOverUnder,
  getAllLeaguesOverUnder,
  pct,
  type TeamOverUnder,
} from "@/lib/stats/over-under";
import { COUNTRY_BY_LEAGUE } from "@/lib/sports/sport-leagues";
import { enLeagueName, enCountryName, koEnLanguages } from "@/lib/i18n/en";
import {
  DivergingBar,
  StatTile,
  DistributionChart,
  OverUnderLegend,
  OVER_HUE,
  UNDER_HUE,
} from "@/components/en/stats/OverUnderChart";
import { breadcrumbLd, jsonLdScript } from "@/lib/seo/jsonld";

export const revalidate = 1800;

const SITE = "https://www.scorebase.kr";
const ymd = (iso: string) => iso.slice(0, 10);
const f1 = (v: number) => v.toFixed(1);

// generateStaticParams 를 두지 않는다 — 93개 리그를 빌드 타임에 정적 생성하면 빌드가 길어지고
// DB 부하가 몰린다. revalidate(30분) + 요청 시 렌더로 충분하다.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ league: string }>;
}): Promise<Metadata> {
  const { league } = await params;
  const data = await getLeagueOverUnder(league);
  if (!data) return { title: "Over/Under stats" };
  const ko = enLeagueName(league);
  const over = f1(pct(data.over25, data.matches));
  const top = data.teams[0];
  const bottom = data.teams.at(-1);

  const title = `${ko} Over/Under Stats — Team Over 2.5 Ranking (${data.matches} matches)`;
  const description =
    `${ko} has an over 2.5 rate of ${over}%. Overs come most often for ${top?.name} (${f1(pct(top?.over25 ?? 0, top?.matches ?? 1))}%) ` +
    `and least often for ${bottom?.name} (unders ${f1(100 - pct(bottom?.over25 ?? 0, bottom?.matches ?? 1))}%). ` +
    `Average ${(data.goals / data.matches).toFixed(2)} goals per match, BTTS ${f1(pct(data.btts, data.matches))}%. Updated as each match finishes.`;

  return {
    title,
    description,
    keywords: [
      `${ko} over under`, `${ko} over 2.5`, `${ko} btts`, `${ko} goals per match`,
      `${ko} highest scoring teams`, `${ko} lowest scoring teams`,
      "football over under stats", "over 2.5 statistics",
    ].join(", "),
    alternates: {
      canonical: `${SITE}/en/over-under/${league}`,
      languages: koEnLanguages(`/over-under/${league}`, `/en/over-under/${league}`),
    },
    openGraph: { title, description, url: `${SITE}/en/over-under/${league}`, type: "article" },
  };
}

/** 표 한 행 — 오버/언더 계열 지표를 한 줄에 모은다. */
function TeamRow({ t, rank, average }: { t: TeamOverUnder; rank: number; average: number }) {
  const o25 = pct(t.over25, t.matches);
  const under = 100 - o25;
  const td = "px-2 py-2 text-right tabular-nums whitespace-nowrap";
  return (
    <tr className="border-b border-neutral-100 dark:border-neutral-800/70 hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
      <td className="px-2 py-2 text-neutral-500 tabular-nums">{rank}</td>
      <td className="px-2 py-2">
        <span className="flex items-center gap-2">
          {t.logoUrl ? (
            // 팀 로고는 장식이라 alt 를 비워 스크린리더가 팀명을 두 번 읽지 않게 한다
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.logoUrl} alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" loading="lazy" />
          ) : null}
          <span className="truncate">{t.name}</span>
        </span>
      </td>
      <td className={`${td} text-neutral-500`}>{t.matches}</td>
      <td className={`${td} font-semibold ${o25 >= average ? OVER_HUE : UNDER_HUE}`}>
        {f1(o25)}%
        <span className="ml-1 text-[11px] font-normal text-neutral-400">({t.over25})</span>
      </td>
      <td className={`${td} text-neutral-600 dark:text-neutral-400`}>{f1(under)}%</td>
      <td className={`${td} text-neutral-600 dark:text-neutral-400`}>{f1(pct(t.over15, t.matches))}%</td>
      <td className={`${td} text-neutral-600 dark:text-neutral-400`}>{f1(pct(t.over35, t.matches))}%</td>
      <td className={`${td} text-neutral-600 dark:text-neutral-400`}>{f1(pct(t.btts, t.matches))}%</td>
      <td className={`${td} text-neutral-600 dark:text-neutral-400`}>
        {((t.goalsFor + t.goalsAgainst) / t.matches).toFixed(2)}
      </td>
      <td className={`${td} text-neutral-500`}>{f1(pct(t.homeOver25, t.homeMatches))}%</td>
      <td className={`${td} text-neutral-500`}>{f1(pct(t.awayOver25, t.awayMatches))}%</td>
    </tr>
  );
}

export default async function Page({ params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  const data = await getLeagueOverUnder(league);
  if (!data) notFound();

  const all = await getAllLeaguesOverUnder();
  const ko = enLeagueName(league);
  const country = enCountryName(COUNTRY_BY_LEAGUE[league]);
  const leagueOver = pct(data.over25, data.matches);
  const goalsPer = data.goals / data.matches;

  const ranked = [...data.teams].sort((a, b) => pct(b.over25, b.matches) - pct(a.over25, a.matches));
  const maxDelta = Math.max(
    ...ranked.map((t) => Math.abs(pct(t.over25, t.matches) - leagueOver)),
    1,
  );
  const overTop = ranked.slice(0, 5);
  const underTop = [...ranked].reverse().slice(0, 5);

  const leagueRank = all.findIndex((l) => l.league === league) + 1;
  const th = "px-2 py-2 text-right font-semibold whitespace-nowrap";

  return (
    <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            breadcrumbLd([
              { name: "Home", path: "/en" },
              { name: "Over/Under stats", path: "/en/over-under" },
              { name: ko, path: `/en/over-under/${league}` },
            ]),
          ),
        }}
      />

      <Link
        href="/en/over-under"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
      >
        <ArrowLeft className="h-4 w-4" /> All leagues
      </Link>

      <h1 className="mt-4 text-2xl sm:text-4xl font-bold tracking-tight break-keep">
        {ko} Over/Under Stats
      </h1>
      <p className="mt-3 text-sm sm:text-base text-neutral-600 dark:text-neutral-400 break-keep">
        {country ? `${country} · ` : ""}
        {data.matches.toLocaleString()} matches ({ymd(data.firstAt)} ~ {ymd(data.lastAt)}). Over 2.5 means three or more total goals in a match. Recalculated as each match finishes.
      </p>

      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <StatTile
          label="Over 2.5 rate"
          value={`${f1(leagueOver)}%`}
          sub={`${data.over25} matches of ${data.matches}`}
          tone={leagueOver >= 50 ? "over" : "under"}
        />
        <StatTile label="Goals per match" value={goalsPer.toFixed(2)} sub={`${data.goals.toLocaleString()} goals total`} />
        <StatTile label="Both teams scored" value={`${f1(pct(data.btts, data.matches))}%`} sub={`${data.btts} matches`} />
        <StatTile
          label="League rank for overs"
          value={leagueRank > 0 ? `${leagueRank}` : "-"}
          sub={`of ${all.length} leagues`}
        />
      </div>

      <section className="mt-10">
        <h2 className="text-lg sm:text-xl font-bold">
          Most overs · most unders
        </h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 break-keep">
          {ko} — overs come most often for <strong>{overTop[0]?.name}</strong>.{" "}
          {overTop[0]?.matches} matches played, {overTop[0]?.over25} of them (
          {f1(pct(overTop[0]?.over25 ?? 0, overTop[0]?.matches ?? 1))}%) with three or more goals. At the other end,{" "}
          <strong>{underTop[0]?.name}</strong> has an under rate of{" "}
          {f1(100 - pct(underTop[0]?.over25 ?? 0, underTop[0]?.matches ?? 1))}%.
        </p>

        <div className="mt-4 rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 sm:p-4">
          <OverUnderLegend average={leagueOver} />
          <div className="mt-3">
            {ranked.map((t) => (
              <DivergingBar
                key={t.teamId}
                label={t.name}
                value={pct(t.over25, t.matches)}
                average={leagueOver}
                maxDelta={maxDelta}
                detail={`${t.matches} matches · overs ${t.over25} · ${((t.goalsFor + t.goalsAgainst) / t.matches).toFixed(2)} goals/match`}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg sm:text-xl font-bold">{ko} full team over/under table</h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 break-keep">
          Sorted by over 2.5 rate. Unders are simply the remainder, so reading from the bottom gives the under ranking.
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900/70">
              <tr className="border-b border-neutral-200 dark:border-neutral-800">
                <th className="px-2 py-2 text-left font-semibold">#</th>
                <th className="px-2 py-2 text-left font-semibold">Team</th>
                <th className={th}>Matches</th>
                <th className={th}>Over 2.5</th>
                <th className={th}>Under 2.5</th>
                <th className={th}>Over 1.5</th>
                <th className={th}>Over 3.5</th>
                <th className={th}>BTTS</th>
                <th className={th}>Goals/match</th>
                <th className={th}>Home over</th>
                <th className={th}>Away over</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((t, i) => (
                <TeamRow key={t.teamId} t={t} rank={i + 1} average={leagueOver} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-neutral-500">
          Teams with fewer than 8 matches are excluded — the rates swing too much.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg sm:text-xl font-bold">Where {ko}sits among all leagues</h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 break-keep">
          Distribution of over 2.5 rates across the {all.length} football leagues we track. {ko} is at {f1(leagueOver)}%,
          {leagueRank > 0 ? ` ${leagueRank}` : ""}
        </p>
        <DistributionChart values={all.map((l) => l.over25Pct)} highlight={leagueOver} highlightLabel={ko} />
      </section>

      <section className="mt-10">
        <h2 className="text-lg sm:text-xl font-bold">Other leagues</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {all.slice(0, 24).map((l) => (
            <Link
              key={l.league}
              href={`/en/over-under/${l.league}`}
              className={`rounded-lg border px-3 py-1.5 text-xs sm:text-sm transition-colors ${
                l.league === league
                  ? "border-neutral-900 dark:border-neutral-100 font-semibold"
                  : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600"
              }`}
            >
              {enLeagueName(l.league)}
              <span className="ml-1.5 text-neutral-500 tabular-nums">{f1(l.over25Pct)}%</span>
            </Link>
          ))}
        </div>
        <Link href="/en/over-under" className="mt-4 inline-block text-sm text-blue-600 dark:text-blue-400 hover:underline">
          {all.length}leagues in full →
        </Link>
      </section>
    </div>
  );
}
