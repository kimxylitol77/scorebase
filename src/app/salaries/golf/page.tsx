// /salaries/golf — PGA 투어 시즌 상금 랭킹 (USD + 한화 환산, top 60).
// 데이터: ESPN 골프 통계 API → PlayerSalary(GOLF) (cron fetch-salaries 주간 replace).
// teamName 필드 = 국가(영문) — 골프는 소속 팀이 없다. 한글 국가명은 fifaCountryKo 재사용.

import { prisma } from "@/lib/db";
import Link from "next/link";
import type { Metadata } from "next";
import { fifaCountryKo } from "@/lib/sports/fifa-rankings";
import AmbientGlow from "@/components/AmbientGlow";
import PlayerValueTabs from "@/components/PlayerValueTabs";
import { CircleDollarSign } from "lucide-react";
import golfNames from "../../../../data/golf-player-names.json";

export const revalidate = 3600;

const NAMES = golfNames as Record<string, string>;
const FX_FALLBACK = 1520; // USD→KRW fallback (2026-06 실측 ~1,520)

export const metadata: Metadata = {
  title: "골프 상금 랭킹 — PGA 투어 시즌 상금 순위 (한화)",
  description:
    "PGA 투어 시즌 상금(머니리스트) 순위를 달러·원화로. 셰플러 등 상금 상위 60명과 임성재·김시우·김주형 한국 선수 위치까지 한국어로 — 매주 자동 갱신, 데이터 ESPN.",
  keywords: ["골프 상금 랭킹", "PGA 상금 순위", "PGA 머니리스트", "골프 상금 순위", "임성재 상금", "김주형 상금", "셰플러 상금"],
  alternates: { canonical: "https://www.scorebase.kr/salaries/golf" },
};

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}
function fmtFull(n: number): string {
  return `$${n.toLocaleString()}`;
}
function fmtKrw(usd: number, rate: number): string {
  const won = usd * rate;
  if (won >= 1e8) return `약 ${Math.round(won / 1e8).toLocaleString()}억원`;
  if (won >= 1e4) return `약 ${Math.round(won / 1e4).toLocaleString()}만원`;
  return `약 ${Math.round(won).toLocaleString()}원`;
}

async function fetchUsdKrw(): Promise<number> {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=KRW", {
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

export default async function GolfSalariesPage() {
  const rate = await fetchUsdKrw();
  const rows = await prisma.playerSalary.findMany({
    where: { league: "GOLF" },
    orderBy: { rank: "asc" },
  });
  const season = rows[0]?.season ?? String(new Date().getUTCFullYear());
  const updated = rows[0]?.updatedAt ? rows[0].updatedAt.toISOString().slice(0, 10) : null;

  return (
    <main className="relative max-w-3xl lg:max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <AmbientGlow />
      <PlayerValueTabs active="/salaries/golf" />

      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-neutral-400">
          <Link href="/scores?sport=golf" className="hover:underline">골프</Link>
          <span>›</span>
          <span className="text-neutral-600 dark:text-neutral-300">상금 랭킹</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 상금 랭킹
        </span>
        <h1 className="flex items-center gap-2.5 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">
          <CircleDollarSign className="h-8 w-8 shrink-0 text-rose-500" aria-hidden /> 골프 상금 랭킹
        </h1>
        <p className="text-sm text-neutral-500 leading-relaxed break-keep">
          {season} 시즌 PGA 투어 공식 상금(머니리스트) 순위 top {rows.length || 60} (달러·원화) · 매주 자동 갱신 · 한국 선수는 색으로 강조.
        </p>
      </header>

      <p className="text-xs text-neutral-500">
        성적 기준 순위가 궁금하다면{" "}
        <Link href="/golf/korea?view=world" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
          골프 세계랭킹 보기
        </Link>
        .
      </p>

      {rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-400">상금 데이터를 불러오는 중입니다.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:border-neutral-800 dark:bg-white/[0.04] dark:shadow-none">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-white/[0.03] text-xs text-neutral-500">
                <th className="px-3 py-2.5 text-center font-semibold w-12">#</th>
                <th className="px-2 py-2.5 text-left font-semibold">선수</th>
                <th className="px-2 py-2.5 text-left font-semibold hidden sm:table-cell">국가</th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">시즌 상금</th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap hidden lg:table-cell">원화 환산</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const top3 = r.rank <= 3;
                const isKorean = r.teamName === "South Korea";
                const nameKo = NAMES[r.playerName] ?? null;
                return (
                  <tr key={r.id} className="border-b border-neutral-100 dark:border-neutral-800/60 last:border-0 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-neutral-50 dark:hover:bg-white/[0.04]">
                    <td className="px-3 py-2.5 text-center tabular-nums font-bold text-neutral-400">{r.rank}</td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar photo={r.photoUrl} name={nameKo ?? r.playerName} />
                        <span className="min-w-0">
                          <span className={`block truncate font-semibold ${isKorean ? "text-rose-600 dark:text-rose-400" : top3 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                            {nameKo ?? r.playerName}
                          </span>
                          {nameKo && <span className="block truncate text-[11px] font-normal text-neutral-400">{r.playerName}</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-neutral-500 hidden sm:table-cell">
                      {r.teamName ? (fifaCountryKo(r.teamName) ?? r.teamName) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap" title={fmtFull(r.salary)}>
                      <div className="tabular-nums font-bold">{fmtUsd(r.salary)}</div>
                      <div className="lg:hidden text-[11px] tabular-nums text-neutral-400">{fmtKrw(r.salary, rate)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums text-neutral-500 dark:text-neutral-400 hidden lg:table-cell">{fmtKrw(r.salary, rate)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <footer className="border-t border-neutral-200 dark:border-neutral-800 pt-4 text-xs text-neutral-400 leading-relaxed">
        상금은 {season} 시즌 PGA 투어 공식 상금(Official Money, USD) 기준이며, 원화는 1달러 = {Math.round(rate).toLocaleString()}원 적용한 근사값입니다.
        {updated && ` 마지막 갱신 ${updated}.`} 데이터 제공{" "}
        <a href="https://www.espn.com/golf/moneylist" target="_blank" rel="nofollow noopener" className="text-blue-600 dark:text-blue-400 hover:underline">
          ESPN
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

/** 선수 아바타 — ESPN 골프 headshot, 없으면 이니셜 원형. */
function Avatar({ photo, name }: { photo?: string | null; name: string }) {
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt="" loading="lazy" className="h-7 w-7 lg:h-9 lg:w-9 rounded-full bg-neutral-100 dark:bg-neutral-800 object-cover object-top shrink-0" />;
  }
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <span className="inline-flex h-7 w-7 lg:h-9 lg:w-9 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700 text-[11px] font-bold text-neutral-500 dark:text-neutral-300 shrink-0">
      {initial}
    </span>
  );
}
