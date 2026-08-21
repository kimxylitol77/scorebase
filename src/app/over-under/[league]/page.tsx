// 리그별 오버/언더 통계 페이지 — /over-under/BUNDESLIGA 처럼 리그 코드로 접근한다.
// DB 를 직접 집계하므로 경기가 끝나면 다음 렌더에서 바로 반영된다(재생성 cron 불필요).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  getLeagueOverUnder,
  getAllLeaguesOverUnder,
  pct,
  josa,
  type TeamOverUnder,
} from "@/lib/stats/over-under";
import { LEAGUE_DISPLAY, COUNTRY_BY_LEAGUE } from "@/lib/sports/sport-leagues";
import {
  DivergingBar,
  StatTile,
  DistributionChart,
  OverUnderLegend,
  OVER_HUE,
  UNDER_HUE,
} from "@/components/stats/OverUnderChart";
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
  if (!data) return { title: "오버 언더 통계" };
  const ko = LEAGUE_DISPLAY[league] ?? league;
  const over = f1(pct(data.over25, data.matches));
  const top = data.teams[0];
  const bottom = data.teams.at(-1);

  const title = `${ko} 오버 언더 통계 — 오버 많이 나는 팀 순위 (${data.matches}경기 집계)`;
  const description =
    `${ko} 오버 2.5 비율은 ${over}%입니다. 오버가 가장 잦은 팀은 ${top?.nameKo}(${f1(pct(top?.over25 ?? 0, top?.matches ?? 1))}%), ` +
    `언더가 가장 잦은 팀은 ${bottom?.nameKo}(언더 ${f1(100 - pct(bottom?.over25 ?? 0, bottom?.matches ?? 1))}%)입니다. ` +
    `경기당 평균 ${(data.goals / data.matches).toFixed(2)}골, 양팀 득점 ${f1(pct(data.btts, data.matches))}%. 경기가 끝날 때마다 갱신됩니다.`;

  return {
    title,
    description,
    keywords: [
      `${ko} 오버`, `${ko} 언더`, `${ko} 오버언더`, `${ko} 오버 2.5`,
      `${ko} 오버 많이 나는 팀`, `${ko} 언더 많이 나는 팀`, `${ko} 경기당 득점`,
      "축구 오버언더 통계", "오버 2.5 통계",
    ].join(", "),
    alternates: { canonical: `${SITE}/over-under/${league}` },
    openGraph: { title, description, url: `${SITE}/over-under/${league}`, type: "article" },
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
          <span className="truncate">{t.nameKo}</span>
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
  const ko = LEAGUE_DISPLAY[league] ?? league;
  const country = COUNTRY_BY_LEAGUE[league];
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
              { name: "홈", path: "/" },
              { name: "오버 언더 통계", path: "/over-under" },
              { name: ko, path: `/over-under/${league}` },
            ]),
          ),
        }}
      />

      <Link
        href="/over-under"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
      >
        <ArrowLeft className="h-4 w-4" /> 리그 전체 보기
      </Link>

      <h1 className="mt-4 text-2xl sm:text-4xl font-bold tracking-tight break-keep">
        {ko} 오버 언더 통계
      </h1>
      <p className="mt-3 text-sm sm:text-base text-neutral-600 dark:text-neutral-400 break-keep">
        {country ? `${country} · ` : ""}
        {data.matches.toLocaleString()}경기 집계 ({ymd(data.firstAt)} ~ {ymd(data.lastAt)}). 오버 2.5 는 한 경기 총득점이 3골
        이상인 경우를 말합니다. 경기가 끝날 때마다 자동으로 다시 계산됩니다.
      </p>

      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <StatTile
          label="오버 2.5 비율"
          value={`${f1(leagueOver)}%`}
          sub={`${data.over25}경기 / 전체 ${data.matches}`}
          tone={leagueOver >= 50 ? "over" : "under"}
        />
        <StatTile label="경기당 평균 득점" value={`${goalsPer.toFixed(2)}골`} sub={`총 ${data.goals.toLocaleString()}골`} />
        <StatTile label="양팀 모두 득점" value={`${f1(pct(data.btts, data.matches))}%`} sub={`${data.btts}경기`} />
        <StatTile
          label="오버 리그 순위"
          value={leagueRank > 0 ? `${leagueRank}위` : "-"}
          sub={`집계 대상 ${all.length}개 리그 중`}
        />
      </div>

      <section className="mt-10">
        <h2 className="text-lg sm:text-xl font-bold">
          오버가 가장 잦은 팀 · 언더가 가장 잦은 팀
        </h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 break-keep">
          {ko}에서 오버 2.5가 가장 잦은 팀은 <strong>{overTop[0]?.nameKo}</strong>
          {josa(overTop[0]?.nameKo ?? "", "으로", "로")}{" "}
          {overTop[0]?.matches}경기 중 {overTop[0]?.over25}경기({f1(pct(overTop[0]?.over25 ?? 0, overTop[0]?.matches ?? 1))}%)
          였습니다. 반대로 언더가 가장 잦은 팀은 <strong>{underTop[0]?.nameKo}</strong>
          {josa(underTop[0]?.nameKo ?? "", "으로", "로")} 언더 비율{" "}
          {f1(100 - pct(underTop[0]?.over25 ?? 0, underTop[0]?.matches ?? 1))}%입니다.
        </p>

        <div className="mt-4 rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 sm:p-4">
          <OverUnderLegend average={leagueOver} />
          <div className="mt-3">
            {ranked.map((t) => (
              <DivergingBar
                key={t.teamId}
                label={t.nameKo}
                value={pct(t.over25, t.matches)}
                average={leagueOver}
                maxDelta={maxDelta}
                detail={`${t.matches}경기 중 오버 ${t.over25}경기 · 경기당 ${((t.goalsFor + t.goalsAgainst) / t.matches).toFixed(2)}골`}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg sm:text-xl font-bold">{ko} 팀별 오버 언더 전체 표</h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 break-keep">
          오버 2.5 비율이 높은 순입니다. 언더 비율은 오버의 나머지라, 표를 아래에서부터 읽으면 언더가 잦은 팀 순위가 됩니다.
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900/70">
              <tr className="border-b border-neutral-200 dark:border-neutral-800">
                <th className="px-2 py-2 text-left font-semibold">#</th>
                <th className="px-2 py-2 text-left font-semibold">팀</th>
                <th className={th}>경기</th>
                <th className={th}>오버 2.5</th>
                <th className={th}>언더 2.5</th>
                <th className={th}>오버 1.5</th>
                <th className={th}>오버 3.5</th>
                <th className={th}>양팀 득점</th>
                <th className={th}>경기당 골</th>
                <th className={th}>홈 오버</th>
                <th className={th}>원정 오버</th>
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
          8경기 미만인 팀은 비율이 크게 흔들려 표에서 제외했습니다.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg sm:text-xl font-bold">전체 리그 가운데 {ko}의 위치</h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 break-keep">
          스코어베이스가 집계하는 {all.length}개 축구 리그의 오버 2.5 비율 분포입니다. {ko}는 {f1(leagueOver)}%로
          {leagueRank > 0 ? ` ${leagueRank}위` : ""}에 해당합니다.
        </p>
        <DistributionChart values={all.map((l) => l.over25Pct)} highlight={leagueOver} highlightLabel={ko} />
      </section>

      <section className="mt-10">
        <h2 className="text-lg sm:text-xl font-bold">다른 리그 오버 언더 보기</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {all.slice(0, 24).map((l) => (
            <Link
              key={l.league}
              href={`/over-under/${l.league}`}
              className={`rounded-lg border px-3 py-1.5 text-xs sm:text-sm transition-colors ${
                l.league === league
                  ? "border-neutral-900 dark:border-neutral-100 font-semibold"
                  : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600"
              }`}
            >
              {LEAGUE_DISPLAY[l.league] ?? l.league}
              <span className="ml-1.5 text-neutral-500 tabular-nums">{f1(l.over25Pct)}%</span>
            </Link>
          ))}
        </div>
        <Link href="/over-under" className="mt-4 inline-block text-sm text-blue-600 dark:text-blue-400 hover:underline">
          {all.length}개 리그 전체 보기 →
        </Link>
      </section>
    </div>
  );
}
