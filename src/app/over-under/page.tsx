// 오버/언더 통계 허브 — 축구 전 리그(하부리그 포함)를 오버 2.5 비율로 세운다.
// 각 행에서 리그별 상세 페이지로 들어간다.
import type { Metadata } from "next";
import Link from "next/link";
import { getAllLeaguesOverUnder } from "@/lib/stats/over-under";
import { LEAGUE_DISPLAY, COUNTRY_BY_LEAGUE } from "@/lib/sports/sport-leagues";
import {
  StatTile,
  RatioBar,
  DistributionChart,
  OVER_HUE,
  UNDER_HUE,
} from "@/components/stats/OverUnderChart";
import { breadcrumbLd, jsonLdScript } from "@/lib/seo/jsonld";
import { koEnLanguages } from "@/lib/i18n/en";

export const revalidate = 1800;

const SITE = "https://www.scorebase.kr";
const f1 = (v: number) => v.toFixed(1);

export async function generateMetadata(): Promise<Metadata> {
  const all = await getAllLeaguesOverUnder();
  const matches = all.reduce((a, l) => a + l.matches, 0);
  const top = all[0];
  const bottom = all.at(-1);
  const title = `축구 오버 언더 통계 — 리그별 오버 2.5 순위 (${all.length}개 리그)`;
  const description =
    `하부리그까지 축구 ${all.length}개 리그 ${matches.toLocaleString()}경기의 오버 언더 기록입니다. ` +
    `오버가 가장 잦은 리그는 ${LEAGUE_DISPLAY[top?.league ?? ""] ?? ""}(${f1(top?.over25Pct ?? 0)}%), ` +
    `언더가 가장 잦은 리그는 ${LEAGUE_DISPLAY[bottom?.league ?? ""] ?? ""}(언더 ${f1(100 - (bottom?.over25Pct ?? 0))}%)입니다. 경기가 끝날 때마다 갱신됩니다.`;
  return {
    title,
    description,
    keywords: [
      "축구 오버언더", "오버 2.5 통계", "오버 많이 나는 리그", "언더 많이 나는 리그",
      "오버 많이 나는 팀", "언더 많이 나는 팀", "축구 경기당 득점", "리그별 득점 통계",
      "오버언더 기록", "축구 통계",
    ].join(", "),
    alternates: {
      canonical: `${SITE}/over-under`,
      languages: koEnLanguages("/over-under", "/en/over-under"),
    },
    openGraph: { title, description, url: `${SITE}/over-under`, type: "website" },
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

  // 한국 독자가 실제로 찾는 리그만 골라 한 문장으로 —— "EPL 오버 몇 %" 류 질문에 그대로 답하는 문단이 된다.
  const FEATURED = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "K_LEAGUE_1", "J1_LEAGUE"];
  const featured = FEATURED.map((code) => all.find((l) => l.league === code))
    .filter((l): l is NonNullable<typeof l> => Boolean(l))
    .sort((a, b) => b.over25Pct - a.over25Pct);
  const FEATURED_SENTENCE = featured.length
    ? `${featured
        .map((l) => `${LEAGUE_DISPLAY[l.league] ?? l.league} ${f1(l.over25Pct)}%`)
        .join(", ")} 순으로 오버 2.5가 나왔습니다.`
    : "집계된 주요 리그가 아직 없습니다.";

  return (
    <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            breadcrumbLd([
              { name: "홈", path: "/" },
              { name: "오버 언더 통계", path: "/over-under" },
            ]),
          ),
        }}
      />

      <h1 className="text-2xl sm:text-4xl font-bold tracking-tight break-keep">축구 오버 언더 통계</h1>
      <p className="mt-3 text-sm sm:text-base text-neutral-600 dark:text-neutral-400 break-keep">
        1부부터 하부리그까지 축구 {all.length}개 리그 {matches.toLocaleString()}경기를 집계했습니다. 오버 2.5는 한 경기
        총득점이 3골 이상인 경우입니다. 경기가 끝날 때마다 다시 계산되므로 표는 늘 최신 상태입니다.
      </p>
      {/* 결론 문단 — 표에만 있던 답을 문장으로 꺼낸다. 표는 AI 답변에 통째로 인용되지 않고
          문단 단위로 발췌되므로, 앞 맥락 없이도 완결되는 문장이 있어야 인용 대상이 된다.
          숫자는 전부 집계에서 나오므로 경기가 쌓이면 이 문장도 함께 갱신된다. */}
      <p className="mt-3 text-sm sm:text-base text-neutral-700 dark:text-neutral-300 break-keep">
        오버가 가장 자주 나오는 리그는 <strong>{LEAGUE_DISPLAY[top?.league ?? ""] ?? "-"}</strong>입니다. 전체 경기의{" "}
        {f1(top?.over25Pct ?? 0)}%에서 3골 이상이 나왔고 경기당 평균 {(top?.goalsPerMatch ?? 0).toFixed(2)}골을 기록했습니다.
        반대로 언더가 가장 자주 나오는 리그는 <strong>{LEAGUE_DISPLAY[bottom?.league ?? ""] ?? "-"}</strong>입니다. 언더 비율{" "}
        {f1(100 - (bottom?.over25Pct ?? 0))}%에 경기당 평균 {(bottom?.goalsPerMatch ?? 0).toFixed(2)}골로, 두 리그의 차이는{" "}
        {f1((top?.over25Pct ?? 0) - (bottom?.over25Pct ?? 0))}%포인트입니다. {all.length}개 리그 전체 평균은 오버 {f1(avg)}%입니다.
      </p>
      <p className="mt-3 text-sm sm:text-base text-neutral-700 dark:text-neutral-300 break-keep">
        한국에서 많이 보는 리그로 좁히면 {FEATURED_SENTENCE}
      </p>

      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <StatTile label="집계 리그" value={`${all.length}개`} sub={`${matches.toLocaleString()}경기`} />
        <StatTile label="전체 오버 2.5" value={`${f1(avg)}%`} sub="경기수로 가중 평균" />
        <StatTile
          label="오버가 가장 잦은 리그"
          value={`${f1(top?.over25Pct ?? 0)}%`}
          sub={LEAGUE_DISPLAY[top?.league ?? ""] ?? "-"}
          tone="over"
        />
        <StatTile
          label="언더가 가장 잦은 리그"
          value={`${f1(100 - (bottom?.over25Pct ?? 0))}%`}
          sub={LEAGUE_DISPLAY[bottom?.league ?? ""] ?? "-"}
          tone="under"
        />
      </div>

      <section className="mt-10">
        <h2 className="text-lg sm:text-xl font-bold">리그별 오버 2.5 비율 분포</h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 break-keep">
          리그가 어느 구간에 몰려 있는지 보여줍니다. 전체 평균은 {f1(avg)}%이며, 총 득점이 많은 리그와 적은 리그의 차이는
          {" "}{f1((top?.over25Pct ?? 0) - (bottom?.over25Pct ?? 0))}%포인트입니다.
        </p>
        <DistributionChart values={all.map((l) => l.over25Pct)} />
      </section>

      <section className="mt-10">
        <h2 className="text-lg sm:text-xl font-bold">전체 리그 순위</h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 break-keep">
          오버 2.5 비율이 높은 순입니다. 아래에서부터 읽으면 언더가 잦은 리그 순위가 됩니다. 리그 이름을 누르면 그 리그의
          팀별 오버 언더 기록을 볼 수 있습니다.
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900/70">
              <tr className="border-b border-neutral-200 dark:border-neutral-800">
                <th className="px-2 py-2 text-left font-semibold">#</th>
                <th className="px-2 py-2 text-left font-semibold">리그</th>
                <th className="px-2 py-2 text-left font-semibold w-28 sm:w-40">오버 2.5</th>
                <th className={th}>비율</th>
                <th className={th}>언더</th>
                <th className={th}>오버 1.5</th>
                <th className={th}>오버 3.5</th>
                <th className={th}>양팀 득점</th>
                <th className={th}>경기당 골</th>
                <th className={th}>경기</th>
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
                    <Link href={`/over-under/${l.league}`} className="hover:underline">
                      <span className="font-medium">{LEAGUE_DISPLAY[l.league] ?? l.league}</span>
                      {COUNTRY_BY_LEAGUE[l.league] ? (
                        <span className="ml-1.5 text-[11px] text-neutral-500">{COUNTRY_BY_LEAGUE[l.league]}</span>
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
          총 {Math.round(goals).toLocaleString()}골 기준. 컵 대회와 친선 경기는 팀당 경기 수가 적어 비율이 흔들리므로 제외했습니다.
        </p>
      </section>
    </div>
  );
}
