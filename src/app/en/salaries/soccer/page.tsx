// /en/salaries/soccer — 빅5 리그 연봉 랭킹 (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

import { prisma } from "@/lib/db";
import Link from "next/link";
import type { Metadata } from "next";
import AmbientGlow from "@/components/AmbientGlow";
import PlayerValueTabs from "@/components/en/PlayerValueTabs";
import PlayerPhoto from "@/components/PlayerPhoto";
import TeamBadge from "@/components/TeamBadge";
import {
  getSoccerSalaries,
  type SoccerBigLeague,
  SOCCER_SALARY_AS_OF,
  SOCCER_SALARY_SEASON,
  SOCCER_SALARY_SOURCE_URL,
} from "@/lib/sports/soccer-salaries";
import rawPhotos from "../../../../../data/player-photos.json";
import { CircleDollarSign } from "lucide-react";
import { enLeagueName, koEnLanguages } from "@/lib/i18n/en";

const PHOTOS = rawPhotos as Record<string, string>;

export const revalidate = 3600;

const BIG5 = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"] as const;

export const metadata: Metadata = {
  title: "Football Player Salaries — Top Earners in Europe's Big Five Leagues",
  description:
    "Salary rankings for the Premier League, LaLiga, Bundesliga, Serie A and Ligue 1. Haaland, Mbappé, Kane and other top earners in EUR — aggregated media estimates, as clubs do not disclose wages.",
  keywords: ["football salaries", "soccer player wages", "Haaland salary", "Mbappe salary", "Premier League wages", "highest paid footballers"],
  alternates: {
    canonical: "https://www.scorebase.kr/en/salaries/soccer",
    languages: koEnLanguages("/salaries/soccer", "/en/salaries/soccer"),
  },
};

function fmtEur(n: number): string {
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `€${Math.round(n / 1_000)}K`;
  return `€${n}`;
}
function fmtFull(n: number): string {
  return `€${n.toLocaleString()}`;
}
// 팀 로고 매칭 — JSON 영문 클럽명 vs DB Team.name (축약·접두어 흡수). 미스는 null.
const CLUB_TOKENS = new Set(["fc", "afc", "cf", "sc", "ac", "as", "ssc", "cd", "club", "de"]);
const CLUB_ALIAS: Array<[RegExp, string]> = [
  [/munchen/g, "munich"],
  [/internazionale/g, "inter"],
  [/parissaintgermain/g, "psg"],
  [/saintgermain/g, "psg"],
];
function normClub(s: string): string {
  let r = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !CLUB_TOKENS.has(w) && !/^\d+$/.test(w))
    .join("");
  for (const [re, to] of CLUB_ALIAS) r = r.replace(re, to);
  return r;
}

async function buildLogoMap(): Promise<(team: string) => string | null> {
  try {
    const teams = await prisma.team.findMany({
      where: { league: { in: [...BIG5] } },
      select: { name: true, logoUrl: true },
    });
    const list: { norm: string; logo: string }[] = [];
    for (const t of teams) {
      if (!t.logoUrl) continue;
      list.push({ norm: normClub(t.name), logo: t.logoUrl });
    }
    return (team: string) => {
      const q = normClub(team);
      if (!q) return null;
      const exact = list.find((t) => t.norm === q);
      if (exact) return exact.logo;
      let best: { norm: string; logo: string } | null = null;
      for (const t of list)
        if (t.norm.length >= 4 && (q.includes(t.norm) || t.norm.includes(q)) && (!best || t.norm.length > best.norm.length))
          best = t;
      return best?.logo ?? null;
    };
  } catch {
    return () => null;
  }
}

// 선수 매칭 — JSON 영문명 vs TheSportsPlayer(빅5 시장가치 풀). 매칭 시 /transfers/{tsId} 링크 + 사진.
// 등록명이 달라 자동 매칭 불가한 선수만 검증된 ts id 수동 오버라이드 (JSON 연 1회 갱신 시 재확인).
const TS_ID_OVERRIDES: Record<string, string> = {
  Casemiro: "dj2ryohy2lpq1zp", // ts 등록명 Carlos Henrique Casimiro
  Marquinhos: "3glrw7h1ew0qdyj", // ts 등록명 Marcos Aoás Corrêa (PSG — 동명 4명 중 풀네임 검증)
};

function normName(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

async function buildPlayerMatcher(): Promise<
  (name: string, nameKo: string) => { href: string; photo: string | null } | null
> {
  try {
    const mv = await prisma.playerMarketValue.findMany({
      where: { league: { in: [...BIG5] } },
      select: { id: true, currentValue: true },
    });
    const players = await prisma.theSportsPlayer.findMany({
      where: { id: { in: [...mv.map((m) => m.id), ...Object.values(TS_ID_OVERRIDES)] } },
      select: { id: true, name: true, nameKo: true, photoUrl: true },
    });
    const val = new Map(mv.map((m) => [m.id, m.currentValue ?? 0]));
    const idx = players.map((p) => ({ ...p, toks: new Set(normName(p.name)), exact: normName(p.name).join(" ") }));
    const byId = new Map(players.map((p) => [p.id, p]));
    return (name, nameKo) => {
      const ovId = TS_ID_OVERRIDES[name];
      let hit = ovId ? (byId.get(ovId) ?? null) : null;
      if (!hit) {
        const q = normName(name);
        const qs = q.join(" ");
        let cands = idx.filter((p) => p.exact === qs);
        if (cands.length === 0) cands = idx.filter((p) => q.every((t) => p.toks.has(t)));
        if (cands.length === 0) cands = idx.filter((p) => p.nameKo === nameKo);
        // 동명이인(사비냐/살리바 등)은 시장가치 최고가 연봉 랭커 본인
        if (cands.length > 1) cands.sort((a, b) => (val.get(b.id) ?? 0) - (val.get(a.id) ?? 0));
        hit = cands[0] ?? null;
      }
      if (!hit) return null;
      return { href: `/en/transfers/${hit.id}`, photo: PHOTOS[hit.id] || hit.photoUrl || null };
    };
  } catch {
    return () => null;
  }
}

export default async function SoccerSalariesPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const { league: leagueParam } = await searchParams;
  const leagueFilter = (BIG5 as readonly string[]).includes(leagueParam ?? "")
    ? (leagueParam as SoccerBigLeague)
    : null;
  const [logoOf, matchPlayer] = await Promise.all([buildLogoMap(), buildPlayerMatcher()]);
  const allRows = getSoccerSalaries();
  // 리그 필터 시에도 순위는 전체 기준 유지 (rank 재계산 안 함)
  const rows = leagueFilter ? allRows.filter((r) => r.league === leagueFilter) : allRows;

  const pill = (on: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
      on
        ? "bg-neutral-900 text-white shadow-[0_8px_24px_-10px_rgba(0,0,0,0.5)] dark:bg-white dark:text-neutral-900"
        : "text-neutral-600 dark:text-neutral-300 ring-1 ring-black/10 dark:ring-white/15 hover:-translate-y-0.5 hover:bg-white dark:hover:bg-white/10"
    }`;

  return (
    <main className="relative max-w-3xl lg:max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
      <AmbientGlow />
      <PlayerValueTabs active="/en/salaries/soccer" />

      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-neutral-400">
          <Link href="/en/scores?sport=soccer" className="hover:underline">Football</Link>
          <span>›</span>
          <span className="text-neutral-600 dark:text-neutral-300">Player Salaries</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> Salaries
        </span>
        <h1 className="flex items-center gap-2.5 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">
          <CircleDollarSign className="h-8 w-8 shrink-0 text-rose-500" aria-hidden /> Football Player Salaries
        </h1>
        <p className="text-sm text-neutral-500 leading-relaxed break-keep">
          {SOCCER_SALARY_SEASON} season — Europe's big five leagues, top {allRows.length} players by estimated pre-tax salary (EUR, bonuses excluded){leagueFilter ? ` — ${enLeagueName(leagueFilter)} ${rows.length}` : ""}.
        </p>
      </header>

      {/* 추정치 고지 — 클럽은 연봉을 공식 발표하지 않는다 */}
      <div className="rounded-xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
        Clubs do not disclose player salaries officially. The figures below are <strong>aggregated media estimates</strong>{" "}
        (as of {SOCCER_SALARY_AS_OF}) and may differ from actual contract terms.
      </div>

      <p className="text-xs text-neutral-500">
        Curious about transfer fees instead?{" "}
        <Link href="/en/transfers" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
          View transfer market values
        </Link>
        .
      </p>

      {/* 리그별 필터 — MLB/NBA/NHL 뷰 토글과 동일 pill 스타일 (순위는 전체 기준 유지) */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/en/salaries/soccer" className={pill(!leagueFilter)}>All</Link>
        {BIG5.map((lg) => (
          <Link key={lg} href={`/en/salaries/soccer?league=${lg}`} className={pill(leagueFilter === lg)}>
            {enLeagueName(lg)}
          </Link>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:border-neutral-800 dark:bg-white/[0.04] dark:shadow-none">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-white/[0.03] text-xs text-neutral-500">
              <th className="px-3 py-2.5 text-center font-semibold w-12">#</th>
              <th className="px-2 py-2.5 text-left font-semibold">Player</th>
              <th className="px-2 py-2.5 text-left font-semibold hidden sm:table-cell">Team</th>
              <th className="px-2 py-2.5 text-left font-semibold hidden md:table-cell">League</th>
              <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Salary (est.)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const top3 = r.rank <= 3;
              const pl = matchPlayer(r.name, r.nameKo);
              const playerCell = (
                <>
                  <PlayerPhoto photo={pl?.photo ?? null} name={r.name} />
                  <span className="min-w-0">
                    <span
                      className={`block truncate font-semibold ${top3 ? "text-amber-600 dark:text-amber-400" : ""} ${pl ? "group-hover:underline" : ""}`}
                    >
                      {r.name}
                    </span>
                  </span>
                </>
              );
              return (
                <tr
                  key={`${r.name}-${r.team}`}
                  className="border-b border-neutral-100 dark:border-neutral-800/60 last:border-0 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-neutral-50 dark:hover:bg-white/[0.04]"
                >
                  <td className="px-3 py-2.5 text-center tabular-nums font-bold text-neutral-400">{r.rank}</td>
                  <td className="px-2 py-2.5">
                    {pl ? (
                      <Link href={pl.href} className="group flex items-center gap-2.5" aria-label={`${r.name} player page`}>
                        {playerCell}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-2.5">{playerCell}</div>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-neutral-500 hidden sm:table-cell">
                    <span className="flex items-center gap-1.5">
                      <TeamBadge logoUrl={logoOf(r.team)} size={18} />
                      {r.team}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 hidden md:table-cell">
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-400">
                      {enLeagueName(r.league)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap" title={fmtFull(r.salary)}>
                    <div className="tabular-nums font-bold">{fmtEur(r.salary)}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="border-t border-neutral-200 dark:border-neutral-800 pt-4 text-xs text-neutral-400 leading-relaxed">
        Figures are estimated pre-tax base salaries for the {SOCCER_SALARY_SEASON} season (EUR, excluding bonuses and
        endorsements). Premier League weekly wages (GBP) are annualised and converted to EUR.
        Estimates aggregated from Capology, Planet Football, GiveMeSport, Sofascore and The National.{" "}
        <a href={SOCCER_SALARY_SOURCE_URL} target="_blank" rel="nofollow noopener" className="text-blue-600 dark:text-blue-400 hover:underline">
          (source article)
        </a>
        .
      </footer>
    </main>
  );
}
