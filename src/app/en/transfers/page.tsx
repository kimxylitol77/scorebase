// /en/transfers — 영어판 이적시장 (린). 루머 트래커(스테이지 배지) + 공식 이적 피드(ts) +
// 시장가치 Top 10. 데이터가 전부 영문 원본(선수·팀명·피)이라 변환 없이 노출.
// ko 의 aiBrief·summaryKo(한국어 생성문)와 스쿼드/베스트XI 뷰는 미사용.
import type { Metadata } from "next";
import Link from "next/link";
import AmbientGlow from "@/components/AmbientGlow";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";
import { enLeagueName } from "@/lib/i18n/en";

export const revalidate = 900;

const LEAGUES = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "SAUDI_PL", "K_LEAGUE_1"] as const;
const LEAGUE_SET = new Set<string>(LEAGUES);

export const metadata: Metadata = {
  title: "Transfer Market — Rumours, Official Deals & Market Values",
  description:
    "Live football transfer tracker — rumours with confidence stages (In talks → Medical → Here we go → Official), confirmed deals with fees, and top market values across the Premier League, LaLiga, Bundesliga, Serie A, Ligue 1, MLS and more.",
  alternates: {
    canonical: `${SITE_URL}/en/transfers`,
    languages: {
      ko: `${SITE_URL}/transfers`,
      en: `${SITE_URL}/en/transfers`,
      "x-default": `${SITE_URL}/transfers`,
    },
  },
};

const STAGE_EN: Record<string, { label: string; cls: string }> = {
  OFFICIAL: { label: "Official", cls: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/30 dark:text-emerald-400" },
  HERE_WE_GO: { label: "Here we go", cls: "bg-blue-500/10 text-blue-600 ring-blue-500/30 dark:text-blue-400" },
  MEDICAL: { label: "Medical", cls: "bg-violet-500/10 text-violet-600 ring-violet-500/30 dark:text-violet-400" },
  TALKS: { label: "In talks", cls: "bg-amber-500/10 text-amber-600 ring-amber-500/30 dark:text-amber-400" },
};

// ts 특수 "팀명"(실클럽 아님) → 영문 라벨
const SPECIAL_TEAM_EN: Record<string, string> = {
  "Free player": "Free agent",
  Retired: "Retired",
  Disqualification: "Suspension",
  Unknown: "—",
};
const teamEn = (name: string | null | undefined) => SPECIAL_TEAM_EN[name ?? ""] ?? name ?? "—";

// 이적 유형 배지 (ts transferType 코드 — ko transfer-display 와 동일 규칙의 영문판)
function badgeEn(t: { fromTeamName: string | null; toTeamName: string | null; transferType: number | null }): string | null {
  if (t.toTeamName === "Retired") return "Retired";
  if (t.toTeamName === "Free player") return "Released";
  if (t.fromTeamName === "Disqualification") return "Return";
  if (t.fromTeamName === "Free player") return "Free signing";
  if (t.transferType === 1) return "Loan";
  if (t.transferType === 2) return "Loan return";
  if (t.transferType === 6) return "Released";
  if (t.transferType === 7) return "Free transfer";
  return null;
}

const fmtFee = (fee: number | null | undefined) =>
  fee && fee > 0 ? (fee >= 1_000_000 ? `€${(fee / 1_000_000).toFixed(fee % 1_000_000 === 0 ? 0 : 1)}M` : `€${Math.round(fee / 1000)}K`) : null;

const fmtValue = (v: number) => (v >= 1_000_000 ? `€${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M` : `€${Math.round(v / 1000)}K`);

const fmtDay = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(d);

// 한국 매체 출처명 로마자 표기 (그 외 한글 출처는 "Korean media")
const SOURCE_EN: Record<string, string> = { 풋볼리스트: "Footballist", 스포탈코리아: "Sportal Korea" };
const sourceEn = (name: string) => (/[가-힣]/.test(name) ? (SOURCE_EN[name] ?? "Korean media") : name);

interface Props {
  searchParams: Promise<{ league?: string }>;
}

export default async function EnTransfers({ searchParams }: Props) {
  const sp = await searchParams;
  const league = sp.league && LEAGUE_SET.has(sp.league.toUpperCase()) ? sp.league.toUpperCase() : null;
  const leagueFilter = league ? [league] : [...LEAGUES];

  const [rumors, feed, topValues] = await Promise.all([
    prisma.transferRumor.findMany({
      where: { hidden: false, ...(league ? { league } : {}) },
      orderBy: { publishedAt: "desc" },
      take: 12,
    }),
    prisma.footballTransfer.findMany({
      where: { league: { in: leagueFilter }, transferTime: { not: null } },
      orderBy: { transferTime: "desc" },
      take: 30,
    }),
    prisma.playerMarketValue.findMany({
      where: { league: { in: leagueFilter }, currentValue: { not: null } },
      orderBy: { currentValue: "desc" },
      take: 10,
      select: { id: true, currentValue: true, age: true, league: true },
    }),
  ]);

  // 선수 영문명 lookup (ts player id) — name 이 한글로 덮인 행은 shortName 폴백, 그것도 없으면 미해석
  const pids = [...new Set([...feed.map((t) => t.playerId), ...topValues.map((v) => v.id)])];
  const players = await prisma.theSportsPlayer.findMany({
    where: { id: { in: pids } },
    select: { id: true, name: true, shortName: true },
  });
  const latin = (s: string | null | undefined) => (s && !/[가-힣]/.test(s) ? s : null);
  const nameById = new Map(
    players
      .map((p) => [p.id, latin(p.name) ?? latin(p.shortName)] as const)
      .filter((e): e is readonly [string, string] => e[1] != null),
  );
  // 이름 미해석 이적은 피드에서 제외 (영어판에 한글·placeholder 노출 방지)
  const feedRows = feed.filter((t) => nameById.has(t.playerId));

  return (
    <main className="relative mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6">
      <AmbientGlow />
      <header className="space-y-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
          Transfer market
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
          Transfers{league ? ` — ${enLeagueName(league)}` : ""}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-neutral-500">
          Rumours graded by confidence, confirmed deals from the official feed, and current market
          values. Updated every few hours.
        </p>
      </header>

      {/* 리그 필터 칩 */}
      <nav className="flex flex-wrap gap-2 text-sm">
        <Link
          href="/en/transfers"
          prefetch={false}
          className={
            !league
              ? "rounded-full bg-neutral-900 px-3 py-1.5 font-semibold text-white dark:bg-white dark:text-neutral-900"
              : "rounded-full bg-white/60 px-3 py-1.5 font-medium text-neutral-600 ring-1 ring-black/10 backdrop-blur transition hover:bg-white dark:bg-white/5 dark:text-neutral-300 dark:ring-white/15 dark:hover:bg-white/10"
          }
        >
          All leagues
        </Link>
        {LEAGUES.map((lg) => (
          <Link
            key={lg}
            href={`/en/transfers?league=${lg}`}
            prefetch={false}
            className={
              league === lg
                ? "rounded-full bg-neutral-900 px-3 py-1.5 font-semibold text-white dark:bg-white dark:text-neutral-900"
                : "rounded-full bg-white/60 px-3 py-1.5 font-medium text-neutral-600 ring-1 ring-black/10 backdrop-blur transition hover:bg-white dark:bg-white/5 dark:text-neutral-300 dark:ring-white/15 dark:hover:bg-white/10"
            }
          >
            {enLeagueName(lg)}
          </Link>
        ))}
      </nav>

      {rumors.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Rumour tracker</h2>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {rumors.map((r) => {
              const stage = STAGE_EN[r.stage] ?? { label: r.stage, cls: "bg-neutral-500/10 text-neutral-500 ring-neutral-500/20" };
              return (
                <div key={r.id} className="rounded-2xl border border-neutral-200 p-4 dark:border-white/10">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${stage.cls}`}>
                      {stage.label}
                    </span>
                    <span className="text-[11px] text-neutral-400">{fmtDay(r.publishedAt)}</span>
                  </div>
                  <div className="mt-2 text-sm font-semibold">{r.playerName}</div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {r.fromTeam ?? "?"} → <span className="font-medium text-neutral-700 dark:text-neutral-300">{r.toTeam ?? "?"}</span>
                    {r.fee && <span className="ml-2 font-semibold text-emerald-600 dark:text-emerald-400">{r.fee}</span>}
                  </div>
                  <a
                    href={r.sourceUrl}
                    target="_blank"
                    rel="nofollow noopener noreferrer"
                    className="mt-1.5 inline-block text-[11px] text-neutral-400 hover:text-neutral-600 hover:underline dark:hover:text-neutral-300"
                  >
                    {sourceEn(r.sourceName)} ↗
                  </a>
                </div>
              );
            })}
          </div>
          <p className="text-xs leading-relaxed text-neutral-400">
            Stages upgrade only (In talks → Medical → Here we go → Official) and debunked rumours
            are removed. Fees are as reported by the source.
          </p>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Official transfer feed</h2>
        {feedRows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500 dark:border-white/15">
            No recent official transfers for this selection.
          </p>
        ) : (
          <div className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200 dark:divide-white/5 dark:border-white/10">
            {feedRows.map((t) => {
              const badge = badgeEn(t);
              const fee = fmtFee(t.transferFee);
              return (
                <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <span className="font-semibold">{nameById.get(t.playerId)}</span>
                    <span className="ml-2 text-xs text-neutral-500">
                      {teamEn(t.fromTeamName)} → <span className="font-medium text-neutral-700 dark:text-neutral-300">{teamEn(t.toTeamName)}</span>
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs">
                    {fee && <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{fee}</span>}
                    {!fee && badge && (
                      <span className="rounded-full bg-neutral-500/10 px-2 py-0.5 font-semibold text-neutral-500 ring-1 ring-neutral-500/20">
                        {badge}
                      </span>
                    )}
                    {t.transferTime && <span className="tabular-nums text-neutral-400">{fmtDay(new Date(t.transferTime * 1000))}</span>}
                    {t.league && <span className="hidden text-neutral-400 sm:inline">{enLeagueName(t.league)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {topValues.filter((v) => nameById.has(v.id)).length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
            Top market values{league ? ` — ${enLeagueName(league)}` : ""}
          </h2>
          <div className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200 dark:divide-white/5 dark:border-white/10">
            {topValues.filter((v) => nameById.has(v.id)).map((v, i) => (
              <div key={v.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-5 text-center font-bold tabular-nums text-neutral-400">{i + 1}</span>
                  <span className="truncate font-semibold">{nameById.get(v.id)}</span>
                  {v.age != null && <span className="shrink-0 text-xs text-neutral-400">{v.age} yrs</span>}
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs">
                  {v.league && <span className="hidden text-neutral-400 sm:inline">{enLeagueName(v.league)}</span>}
                  <span className="font-bold tabular-nums">{fmtValue(v.currentValue!)}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-neutral-400">
            Market values from TheSports valuation history. Full player valuation profiles are on
            the{" "}
            <Link href="/transfers" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
              Korean site
            </Link>
            .
          </p>
        </section>
      )}
    </main>
  );
}
