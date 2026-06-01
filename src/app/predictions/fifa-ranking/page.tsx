// /predictions/fifa-ranking — FIFA 국가 랭킹 전체(211개국). 예측 대시보드 FIFA 카드/버튼에서 진입.
import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, Globe } from "lucide-react";
import {
  FIFA_RANKINGS,
  FIFA_RANKING_DATE,
  fifaCountryKo,
  fifaFlag,
} from "@/lib/sports/fifa-rankings";
import { toKoreanTeamName } from "@/lib/team-names";

export const metadata: Metadata = {
  title: `FIFA 국가 랭킹 ${FIFA_RANKINGS.length}개국 — 축구 국가대표 순위 | 스코어베이스`,
  description: `${FIFA_RANKING_DATE} 기준 FIFA 국가대표 랭킹 ${FIFA_RANKINGS.length}개국 전체. 프랑스·스페인·아르헨티나·대한민국 등 순위와 국기.`,
  keywords: ["FIFA 랭킹", "FIFA 국가 랭킹", "축구 국가대표 순위", "대한민국 FIFA 순위", "월드컵 랭킹"],
  alternates: { canonical: "/predictions/fifa-ranking" },
};

function buildFifaRanking(): { rank: number; name: string; flag: string }[] {
  return FIFA_RANKINGS.map((r) => ({
    rank: r.rank,
    name: fifaCountryKo(r.name) ?? toKoreanTeamName(r.name, "INTL_FRIENDLY"),
    flag: fifaFlag(r.name),
  }));
}

export default function FifaRankingPage() {
  const ranking = buildFifaRanking();
  return (
    <div className="relative min-h-screen bg-[#f5f5f7] dark:bg-transparent">
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-14">
        <Link
          href="/predictions"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 transition hover:text-zinc-900 dark:text-white/45 dark:hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" /> 예측 대시보드
        </Link>
        <div className="mt-4 flex items-baseline justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
            <Globe className="h-6 w-6 text-zinc-500 dark:text-white/50" />
            FIFA 국가 랭킹
          </h1>
          <span className="shrink-0 text-xs sm:text-sm tabular-nums text-zinc-400 dark:text-white/40">
            {FIFA_RANKING_DATE} 기준 · {ranking.length}개국
          </span>
        </div>
        <p className="mt-2 text-sm text-zinc-500 dark:text-white/50">
          국제축구연맹(FIFA) 공식 남자 국가대표 랭킹. 국가대항 매치(친선·예선)의 순위 표시 기준입니다.
        </p>
        <div className="mt-6 rounded-[1.5rem] sm:rounded-[2rem] bg-white p-3 sm:p-5 shadow-sm ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-0.5">
            {ranking.map((c) => (
              <li
                key={c.rank}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
              >
                <span
                  className={`w-6 shrink-0 text-right tabular-nums text-sm font-bold ${
                    c.rank === 1
                      ? "text-amber-500"
                      : c.rank <= 3
                        ? "text-amber-600/80 dark:text-amber-400/80"
                        : c.rank <= 10
                          ? "text-zinc-600 dark:text-white/60"
                          : "text-zinc-400 dark:text-white/35"
                  }`}
                >
                  {c.rank}
                </span>
                <span className="w-5 shrink-0 text-center text-base leading-none" aria-hidden>
                  {c.flag}
                </span>
                <span className="truncate text-sm text-zinc-800 dark:text-white/85">{c.name}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}
