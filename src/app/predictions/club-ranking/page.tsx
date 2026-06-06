// /predictions/club-ranking — 세계 클럽 랭킹 상위 150 (TheSports ranking/club). 예측 대시보드에서 진입.
//  FIFA 국가 랭킹(/predictions/fifa-ranking)의 클럽 버전. 정적 JSON(data/club-rankings.json) 읽기.
import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, Trophy } from "lucide-react";
import { toKoreanTeamName } from "@/lib/team-names";
import rawClubs from "../../../../data/club-rankings.json";

interface ClubRank { rank: number; name: string; logo: string | null; countryLogo: string | null; points: number; prev: number; change: number }
const CLUBS = rawClubs as ClubRank[];

export const metadata: Metadata = {
  title: `세계 클럽 랭킹 TOP ${CLUBS.length} — 축구 클럽 순위 | 스코어베이스`,
  description: `세계 축구 클럽 랭킹 ${CLUBS.length}위까지. 바이에른 뮌헨·아스널·PSG·바르셀로나·레알 마드리드 등 클럽 순위와 포인트, 순위 변동.`,
  keywords: ["클럽 랭킹", "축구 클럽 순위", "세계 클럽 랭킹", "축구 팀 순위", "스코어베이스"],
  alternates: { canonical: "/predictions/club-ranking" },
};

export default function ClubRankingPage() {
  return (
    <div className="relative min-h-screen bg-[#f5f5f7] dark:bg-transparent">
      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-10 sm:py-14">
        <Link
          href="/predictions"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 transition hover:text-zinc-900 dark:text-white/45 dark:hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" /> 예측 대시보드
        </Link>
        <div className="mt-4 flex items-baseline justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
            <Trophy className="h-6 w-6 text-zinc-500 dark:text-white/50" />
            세계 클럽 랭킹
          </h1>
          <span className="shrink-0 text-xs sm:text-sm tabular-nums text-zinc-400 dark:text-white/40">
            TOP {CLUBS.length}
          </span>
        </div>
        <p className="mt-2 text-sm text-zinc-500 dark:text-white/50">
          세계 축구 클럽 순위. 최근 경기 성적 기반 포인트 · 순위 변동 표시.
        </p>
        <div className="mt-6 rounded-[1.5rem] sm:rounded-[2rem] bg-white p-3 sm:p-5 shadow-sm ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          <ol className="grid grid-cols-1 lg:grid-cols-2 gap-x-5 gap-y-0.5">
            {CLUBS.map((c) => {
              const ko = toKoreanTeamName(c.name) || c.name;
              const up = c.change > 0, down = c.change < 0;
              return (
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
                  {c.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.logo} alt="" className="w-5 h-5 shrink-0 object-contain" />
                  ) : (
                    <span className="w-5 shrink-0" aria-hidden />
                  )}
                  <span className="flex-1 truncate text-sm text-zinc-800 dark:text-white/85">{ko}</span>
                  {(up || down) && (
                    <span className={`shrink-0 text-[11px] tabular-nums ${up ? "text-emerald-500" : "text-rose-500"}`}>
                      {up ? "▲" : "▼"}{Math.abs(c.change)}
                    </span>
                  )}
                  <span className="w-12 shrink-0 text-right tabular-nums text-xs text-zinc-500 dark:text-white/50">{c.points}</span>
                </li>
              );
            })}
          </ol>
        </div>
        <p className="mt-4 text-center text-xs text-zinc-400 dark:text-white/35">클럽 랭킹 데이터 = 스코어베이스</p>
      </section>
    </div>
  );
}
