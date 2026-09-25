// 리그 전체 목록 — 종목·국가별로 데이터가 있는 리그 페이지를 한곳에 모은다(검색·AI 크롤러의 리그 페이지 진입 경로).
// 2026-09-25 축구 외 종목까지 리그 페이지를 정식으로 올리면서, /scores 외엔 들어갈 길이 없던 리그들의 허브.
import type { Metadata } from "next";
import Link from "next/link";
import {
  ALL_LEAGUES,
  COUNTRY_BY_LEAGUE,
  COUNTRY_ORDER,
  LEAGUE_DISPLAY,
  SPORTS,
  getLeagueFlag,
  sportCodeForLeague,
} from "@/lib/sports/sport-leagues";
import { getLeaguePageFacts, type LeagueFacts } from "@/lib/seo/league-page-facts";
import { breadcrumbLd, itemListLd } from "@/lib/seo/jsonld";

export const revalidate = 3600;

const PAGE_SPORTS = ["soccer", "baseball", "basketball", "hockey", "volleyball", "esports"] as const;

export const metadata: Metadata = {
  title: "리그 전체 — 축구·야구·농구·하키·배구·e스포츠 리그 순위·일정",
  description:
    "스코어베이스가 다루는 전 세계 리그 목록. 축구 1·2부와 컵 대회, KBO·MLB·NPB, NBA·KBL, NHL·KHL, V-리그, LCK까지 리그별 순위표·경기 일정·결과·선수 기록 페이지로 바로 이동.",
  alternates: { canonical: "/leagues" },
};

const kstMd = (iso: string) => {
  const k = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()}`;
};

export default async function LeaguesIndexPage() {
  const facts = await getLeaguePageFacts().catch(() => ({}) as Record<string, LeagueFacts>);
  const orderOf = (c: string) => {
    const i = COUNTRY_ORDER.indexOf(c);
    return i < 0 ? 999 : i;
  };

  const sections = PAGE_SPORTS.map((code) => {
    const meta = SPORTS.find((s) => s.code === code);
    // 경기나 선수 기록이 하나라도 있는 리그만 — 빈 페이지로 보내지 않는다.
    const leagues = (ALL_LEAGUES as readonly string[])
      .filter((l) => sportCodeForLeague(l) === code)
      .filter((l) => (facts[l]?.matches365 ?? 0) > 0 || (facts[l]?.leaders ?? 0) > 0);
    const byCountry = new Map<string, string[]>();
    for (const l of leagues) {
      const c = COUNTRY_BY_LEAGUE[l] ?? "국제";
      byCountry.set(c, [...(byCountry.get(c) ?? []), l]);
    }
    const countries = [...byCountry.entries()].sort((a, b) => orderOf(a[0]) - orderOf(b[0]) || a[0].localeCompare(b[0], "ko"));
    return { code, label: meta?.label ?? code, count: leagues.length, countries };
  }).filter((s) => s.count > 0);

  const total = sections.reduce((n, s) => n + s.count, 0);
  const jsonLd = [
    breadcrumbLd([
      { name: "홈", path: "/" },
      { name: "리그 전체", path: "/leagues" },
    ]),
    itemListLd({
      name: "스코어베이스 리그 전체",
      items: sections.flatMap((s) => s.countries.flatMap(([, ls]) => ls.map((l) => ({ name: LEAGUE_DISPLAY[l] ?? l, path: `/leagues/${l}` })))),
    }),
  ];

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <header className="space-y-2">
        <h1 className="text-3xl font-black tracking-tight text-zinc-950 dark:text-white">리그 전체</h1>
        <p className="text-sm text-zinc-500 break-keep dark:text-white/55">
          {sections.map((s) => `${s.label} ${s.count}`).join(" · ")} — 총 {total}개 리그. 리그를 누르면 순위표·경기 일정·결과·선수 기록을 볼 수 있습니다.
        </p>
        <nav aria-label="종목 바로가기" className="flex flex-wrap gap-2 pt-2">
          {sections.map((s) => (
            <a
              key={s.code}
              href={`#${s.code}`}
              className="rounded-full bg-zinc-100 px-3 py-1.5 text-[13px] font-semibold text-zinc-700 ring-1 ring-black/5 hover:bg-zinc-200 dark:bg-white/[0.06] dark:text-white/80 dark:ring-white/10 dark:hover:bg-white/10"
            >
              {s.label} <span className="tabular-nums text-zinc-400 dark:text-white/40">{s.count}</span>
            </a>
          ))}
        </nav>
      </header>

      {sections.map((s) => (
        <section key={s.code} id={s.code} aria-labelledby={`h-${s.code}`} className="space-y-4 scroll-mt-24">
          <h2 id={`h-${s.code}`} className="text-xl font-black tracking-tight text-zinc-950 dark:text-white">
            {s.label} <span className="text-sm font-semibold tabular-nums text-zinc-400 dark:text-white/40">{s.count}개 리그</span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {s.countries.map(([country, ls]) => (
              <div key={country} className="rounded-2xl bg-white p-4 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
                <h3 className="mb-2 text-[12px] font-semibold text-zinc-500 dark:text-white/50">
                  {getLeagueFlag(ls[0]) && <span className="mr-1" aria-hidden>{getLeagueFlag(ls[0])}</span>}
                  {country}
                </h3>
                <ul className="space-y-1">
                  {ls.map((l) => {
                    const f = facts[l];
                    const when = f?.nextMatch ? `다음 경기 ${kstMd(f.nextMatch)}` : f?.lastMatch ? `최근 경기 ${kstMd(f.lastMatch)}` : "";
                    return (
                      <li key={l}>
                        <Link
                          href={`/leagues/${l}`}
                          prefetch={false}
                          className="flex items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-[14px] font-semibold text-zinc-800 hover:bg-zinc-50 dark:text-white/85 dark:hover:bg-white/[0.05]"
                        >
                          <span className="truncate">{LEAGUE_DISPLAY[l] ?? l}</span>
                          <span className="shrink-0 text-[11px] font-normal tabular-nums text-zinc-400 dark:text-white/40">
                            {when}
                            {(f?.leaders ?? 0) > 0 && " · 선수 기록"}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
