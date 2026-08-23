// /en/over-under — 리그별 오버/언더 통계 허브 (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
import type { Metadata } from "next";
import Link from "next/link";
import { getAllLeaguesOverUnder } from "@/lib/stats/over-under";
import { COUNTRY_BY_LEAGUE } from "@/lib/sports/sport-leagues";
import { enLeagueName, enCountryName, koEnLanguages } from "@/lib/i18n/en";
import {
  StatTile,
  RatioBar,
  DistributionChart,
  OVER_HUE,
  UNDER_HUE,
} from "@/components/en/stats/OverUnderChart";
import { breadcrumbLd, jsonLdScript } from "@/lib/seo/jsonld";

export const revalidate = 1800;

const SITE = "https://www.scorebase.kr";
const f1 = (v: number) => v.toFixed(1);

export async function generateMetadata(): Promise<Metadata> {
  const all = await getAllLeaguesOverUnder();
  const matches = all.reduce((a, l) => a + l.matches, 0);
  const top = all[0];
  const bottom = all.at(-1);
  const title = `Football Over/Under Stats — Over 2.5 by League (${all.length} leagues)`;
  const description =
    `Over/under records from ${matches.toLocaleString()} matches across ${all.length} football leagues, lower divisions included. ` +
    `Overs are most frequent in ${enLeagueName(top?.league ?? "")} (${f1(top?.over25Pct ?? 0)}%) and least frequent in ` +
    `${enLeagueName(bottom?.league ?? "")} (unders ${f1(100 - (bottom?.over25Pct ?? 0))}%). Updated as each match finishes.`;
  return {
    title,
    description,
    keywords: [
      "football over under", "over 2.5 stats", "highest scoring leagues", "lowest scoring leagues",
      "goals per match by league", "btts stats", "over under records", "football statistics",
    ].join(", "),
    alternates: {
      canonical: `${SITE}/en/over-under`,
      languages: koEnLanguages("/over-under", "/en/over-under"),
    },
    openGraph: { title, description, url: `${SITE}/en/over-under`, type: "website" },
  };
}

export default async function Page() {
  const all = await getAllLeaguesOverUnder();
  const matches = all.reduce((a, l) => a + l.matches, 0);
  const goals = all.reduce((a, l) => a + l.goalsPerMatch * l.matches, 0);
  const avg = (all.reduce((a, l) => a + l.over25Pct * l.matches, 0) / matches) || 0;
  const top = all[0];
  const bottom = all.at(-1);
  const th = "px-2 py-2 text-right font-semibold whitespace-nowrap";
  const td = "px-2 py-2 text-right tabular-nums whitespace-nowrap";

  return (
    <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            breadcrumbLd([
              { name: "Home", path: "/en" },
              { name: "Over/Under stats", path: "/en/over-under" },
            ]),
          ),
        }}
      />

      <h1 className="text-2xl sm:text-4xl font-bold tracking-tight break-keep">Football Over/Under Stats</h1>
      <p className="mt-3 text-sm sm:text-base text-neutral-600 dark:text-neutral-400 break-keep">
        Aggregated from {all.length}leagues {matches.toLocaleString()}matches across top flights and lower divisions. Over 2.5 means three or more total goals in a match. Figures recalculate as each match finishes.
      </p>

      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <StatTile label="Leagues" value={`${all.length}`} sub={`${matches.toLocaleString()}Matches`} />
        <StatTile label="Overall over 2.5" value={`${f1(avg)}%`} sub="weighted by matches played" />
        <StatTile
          label="Most overs"
          value={`${f1(top?.over25Pct ?? 0)}%`}
          sub={enLeagueName(top?.league ?? "") || "-"}
          tone="over"
        />
        <StatTile
          label="Most unders"
          value={`${f1(100 - (bottom?.over25Pct ?? 0))}%`}
          sub={enLeagueName(bottom?.league ?? "") || "-"}
          tone="under"
        />
      </div>

      <section className="mt-10">
        <h2 className="text-lg sm:text-xl font-bold">Distribution of over 2.5 rates</h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 break-keep">
          Where leagues cluster. The overall average is {f1(avg)}% and the spread between the highest and lowest scoring league is
          {" "}{f1((top?.over25Pct ?? 0) - (bottom?.over25Pct ?? 0))} percentage points.
        </p>
        <DistributionChart values={all.map((l) => l.over25Pct)} />
      </section>

      <section className="mt-10">
        <h2 className="text-lg sm:text-xl font-bold">Full league ranking</h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 break-keep">
          Sorted by over 2.5 rate. Read from the bottom for the leagues where unders are most frequent. Tap a league for its team-by-team records.
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900/70">
              <tr className="border-b border-neutral-200 dark:border-neutral-800">
                <th className="px-2 py-2 text-left font-semibold">#</th>
                <th className="px-2 py-2 text-left font-semibold">League</th>
                <th className="px-2 py-2 text-left font-semibold w-28 sm:w-40">Over 2.5</th>
                <th className={th}>Rate</th>
                <th className={th}>Under</th>
                <th className={th}>Over 1.5</th>
                <th className={th}>Over 3.5</th>
                <th className={th}>BTTS</th>
                <th className={th}>Goals/match</th>
                <th className={th}>Matches</th>
              </tr>
            </thead>
            <tbody>
              {all.map((l, i) => (
                <tr
                  key={l.league}
                  className="border-b border-neutral-100 dark:border-neutral-800/70 hover:bg-neutral-50 dark:hover:bg-neutral-900/50"
                >
                  <td className="px-2 py-2 text-neutral-500 tabular-nums">{i + 1}</td>
                  <td className="px-2 py-2">
                    <Link href={`/en/over-under/${l.league}`} className="hover:underline">
                      <span className="font-medium">{enLeagueName(l.league)}</span>
                      {COUNTRY_BY_LEAGUE[l.league] ? (
                        <span className="ml-1.5 text-[11px] text-neutral-500">{enCountryName(COUNTRY_BY_LEAGUE[l.league])}</span>
                      ) : null}
                    </Link>
                  </td>
                  <td className="px-2 py-2">
                    <RatioBar value={l.over25Pct} average={avg} />
                  </td>
                  <td className={`${td} font-semibold ${l.over25Pct >= avg ? OVER_HUE : UNDER_HUE}`}>
                    {f1(l.over25Pct)}%
                  </td>
                  <td className={`${td} text-neutral-600 dark:text-neutral-400`}>{f1(100 - l.over25Pct)}%</td>
                  <td className={`${td} text-neutral-600 dark:text-neutral-400`}>{f1(l.over15Pct)}%</td>
                  <td className={`${td} text-neutral-600 dark:text-neutral-400`}>{f1(l.over35Pct)}%</td>
                  <td className={`${td} text-neutral-600 dark:text-neutral-400`}>{f1(l.bttsPct)}%</td>
                  <td className={`${td} text-neutral-600 dark:text-neutral-400`}>{l.goalsPerMatch.toFixed(2)}</td>
                  <td className={`${td} text-neutral-500`}>{l.matches.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-neutral-500">
          Based on {Math.round(goals).toLocaleString()}goals. Cups and friendlies are excluded — too few matches per team to give stable rates.
        </p>
      </section>
    </div>
  );
}
