// /salaries/soccer — 축구 빅5 리그 연봉 랭킹 (미디어 종합 추정치, EUR + 한화 환산).
// 데이터: data/soccer-salaries.json 큐레이션 (lib/sports/soccer-salaries 헤더 참고). DB·cron 미경유.
// ⚠️ 클럽은 연봉을 공식 발표하지 않아 "추정" 고지를 페이지에 반드시 유지할 것 (F1 과 동일 규칙).
// 팀 로고 = DB Team(빅5) 이름 매칭 — 미스는 로고 없이 표시 (scorebase-team-logo 스킬 B 경로).

import { prisma } from "@/lib/db";
import Link from "next/link";
import type { Metadata } from "next";
import AmbientGlow from "@/components/AmbientGlow";
import PlayerValueTabs from "@/components/PlayerValueTabs";
import PlayerPhoto from "@/components/PlayerPhoto";
import TeamBadge from "@/components/TeamBadge";
import {
  getSoccerSalaries,
  SOCCER_LEAGUE_KO,
  SOCCER_SALARY_AS_OF,
  SOCCER_SALARY_SEASON,
  SOCCER_SALARY_SOURCE,
  SOCCER_SALARY_SOURCE_URL,
} from "@/lib/sports/soccer-salaries";
import { CircleDollarSign } from "lucide-react";

export const revalidate = 3600;

const FX_FALLBACK = 1650; // EUR→KRW fallback (2026-07 실측 ~1,650)
const BIG5 = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"] as const;

export const metadata: Metadata = {
  title: "축구 선수 연봉 랭킹 — 빅5 리그 최고 연봉 순위 (한화)",
  description:
    "유럽 빅5 리그(EPL·라리가·분데스리가·세리에A·리그1) 축구 선수 연봉 순위를 유로·원화로. 홀란·음바페·케인 등 최고 연봉 선수와 소속팀을 한국어로 — 공식 발표가 없어 미디어 종합 추정치 기준.",
  keywords: ["축구 연봉", "축구선수 연봉 순위", "홀란 연봉", "음바페 연봉", "손흥민 연봉", "EPL 연봉", "빅리그 연봉"],
  alternates: { canonical: "https://www.scorebase.kr/salaries/soccer" },
};

function fmtEur(n: number): string {
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `€${Math.round(n / 1_000)}K`;
  return `€${n}`;
}
function fmtFull(n: number): string {
  return `€${n.toLocaleString()}`;
}
function fmtKrw(eur: number, rate: number): string {
  const won = eur * rate;
  if (won >= 1e8) return `약 ${Math.round(won / 1e8).toLocaleString()}억원`;
  if (won >= 1e4) return `약 ${Math.round(won / 1e4).toLocaleString()}만원`;
  return `약 ${Math.round(won).toLocaleString()}원`;
}

async function fetchEurKrw(): Promise<number> {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=EUR&to=KRW", {
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return FX_FALLBACK;
    const j = (await res.json()) as { rates?: { KRW?: number } };
    const krw = j.rates?.KRW;
    return typeof krw === "number" && krw > 0 ? krw : FX_FALLBACK;
  } catch {
    return FX_FALLBACK;
  }
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

export default async function SoccerSalariesPage() {
  const [rate, logoOf] = await Promise.all([fetchEurKrw(), buildLogoMap()]);
  const rows = getSoccerSalaries();

  return (
    <main className="relative max-w-3xl lg:max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
      <AmbientGlow />
      <PlayerValueTabs active="/salaries/soccer" />

      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-neutral-400">
          <Link href="/scores?sport=soccer" className="hover:underline">축구</Link>
          <span>›</span>
          <span className="text-neutral-600 dark:text-neutral-300">선수 연봉</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 연봉 랭킹
        </span>
        <h1 className="flex items-center gap-2.5 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">
          <CircleDollarSign className="h-8 w-8 shrink-0 text-rose-500" aria-hidden /> 축구 선수 연봉
        </h1>
        <p className="text-sm text-neutral-500 leading-relaxed break-keep">
          {SOCCER_SALARY_SEASON} 시즌 유럽 빅5 리그(EPL·라리가·분데스리가·세리에A·리그1) 최고 연봉 {rows.length}명의
          세전 연봉 추정치(보너스 제외, 유로·원화) 순위.
        </p>
      </header>

      {/* 추정치 고지 — 클럽은 연봉을 공식 발표하지 않는다 */}
      <div className="rounded-xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
        축구 클럽은 선수 연봉을 공식 발표하지 않습니다. 아래 수치는 공식 발표가 아닌 <strong>미디어 종합 추정치</strong>
        ({SOCCER_SALARY_AS_OF} 기준)이며 실제 계약 조건과 다를 수 있습니다.
      </div>

      <p className="text-xs text-neutral-500">
        이적료 기준 선수 몸값이 궁금하다면{" "}
        <Link href="/transfers" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
          이적시장 몸값 보기
        </Link>
        .
      </p>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:border-neutral-800 dark:bg-white/[0.04] dark:shadow-none">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-white/[0.03] text-xs text-neutral-500">
              <th className="px-3 py-2.5 text-center font-semibold w-12">#</th>
              <th className="px-2 py-2.5 text-left font-semibold">선수</th>
              <th className="px-2 py-2.5 text-left font-semibold hidden sm:table-cell">팀</th>
              <th className="px-2 py-2.5 text-left font-semibold hidden md:table-cell">리그</th>
              <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">연봉 (추정)</th>
              <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap hidden lg:table-cell">원화 환산</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const top3 = r.rank <= 3;
              return (
                <tr
                  key={`${r.name}-${r.team}`}
                  className="border-b border-neutral-100 dark:border-neutral-800/60 last:border-0 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-neutral-50 dark:hover:bg-white/[0.04]"
                >
                  <td className="px-3 py-2.5 text-center tabular-nums font-bold text-neutral-400">{r.rank}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <PlayerPhoto photo={null} name={r.nameKo} />
                      <span className="min-w-0">
                        <span className={`block truncate font-semibold ${top3 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                          {r.nameKo}
                        </span>
                        <span className="block truncate text-[11px] font-normal text-neutral-400">{r.name}</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-neutral-500 hidden sm:table-cell">
                    <span className="flex items-center gap-1.5">
                      <TeamBadge logoUrl={logoOf(r.team)} size={18} />
                      {r.teamKo}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 hidden md:table-cell">
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-400">
                      {SOCCER_LEAGUE_KO[r.league]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap" title={fmtFull(r.salary)}>
                    <div className="tabular-nums font-bold">{fmtEur(r.salary)}</div>
                    <div className="lg:hidden text-[11px] tabular-nums text-neutral-400">{fmtKrw(r.salary, rate)}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums text-neutral-500 dark:text-neutral-400 hidden lg:table-cell">
                    {fmtKrw(r.salary, rate)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="border-t border-neutral-200 dark:border-neutral-800 pt-4 text-xs text-neutral-400 leading-relaxed">
        연봉은 {SOCCER_SALARY_SEASON} 시즌 세전 기본급 추정치(EUR, 보너스·스폰서 수입 제외) 기준이며, 원화는 1유로 ={" "}
        {Math.round(rate).toLocaleString()}원 적용한 근사값입니다. EPL 주급(파운드)은 연봉 환산 후 유로로 통일했습니다.
        추정 출처 {SOCCER_SALARY_SOURCE}{" "}
        <a href={SOCCER_SALARY_SOURCE_URL} target="_blank" rel="nofollow noopener" className="text-blue-600 dark:text-blue-400 hover:underline">
          (기준 기사)
        </a>
        {" · 환율 "}
        <a href="https://www.frankfurter.app" target="_blank" rel="nofollow noopener" className="text-blue-600 dark:text-blue-400 hover:underline">
          Frankfurter
        </a>
        .
      </footer>
    </main>
  );
}
