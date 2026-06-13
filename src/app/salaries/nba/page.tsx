// /salaries/nba — NBA 선수 연봉 랭킹.
// 데이터: basketball-reference contracts → PlayerSalary (cron fetch-salaries, 주 1회).
// 축구 시장가치(/transfers)의 농구판 — 단 연봉(실계약액)이라 성격은 다름.

import { prisma } from "@/lib/db";
import Link from "next/link";
import type { Metadata } from "next";
import { toKoreanTeamName } from "@/lib/team-names";
import { lookupNbaPlayer } from "@/lib/sports/nba-players";

export const revalidate = 3600; // 1시간 — 주 1회 갱신이라 충분

export const metadata: Metadata = {
  title: "NBA 선수 연봉 랭킹 — 2025-26 | 스코어베이스",
  description:
    "NBA 선수 연봉 순위 — 스테판 커리·요키치·엠비드 등 최고 연봉 선수 TOP 랭킹. 팀별 한국어 표기. 매주 자동 갱신. 데이터 Basketball Reference.",
  alternates: { canonical: "https://www.scorebase.kr/salaries/nba" },
};

function fmtUsd(n: number): string {
  // $59.6M / $1.2M 형태 — 한눈에 규모 비교
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}
function fmtFull(n: number): string {
  return `$${n.toLocaleString()}`;
}

/** 선수 사진 아바타 — ESPN headshot. 없으면(매칭 실패) 이니셜 원형 fallback. */
function PlayerAvatar({ photo, name }: { photo?: string; name: string }) {
  if (!photo) {
    const initial = name.trim().charAt(0).toUpperCase();
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700 text-[11px] font-bold text-neutral-500 dark:text-neutral-300">
        {initial}
      </span>
    );
  }
  // ESPN headshot 은 투명 배경 PNG — 옅은 원형 배경 위에 얹어 일관된 썸네일.
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={photo}
      alt=""
      loading="lazy"
      className="h-7 w-7 rounded-full bg-neutral-100 dark:bg-neutral-800 object-cover object-top"
    />
  );
}

export default async function NbaSalariesPage() {
  const rows = await prisma.playerSalary.findMany({
    where: { league: "NBA" },
    orderBy: { rank: "asc" },
    take: 300,
  });
  const season = rows[0]?.season ?? "2025-26";
  const totalTop = rows.slice(0, 10).reduce((s, r) => s + r.salary, 0);

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-neutral-400">
          <Link href="/scores" className="hover:underline">라이브 스코어</Link>
          <span>›</span>
          <Link href="/leagues/NBA" className="hover:underline">NBA</Link>
          <span>›</span>
          <span className="text-neutral-600 dark:text-neutral-300">연봉 랭킹</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">💰 NBA 연봉 랭킹</h1>
        <p className="text-sm text-neutral-500 leading-relaxed">
          {season} 시즌 선수별 연봉 순위. 매주 자동 갱신 · 데이터 Basketball Reference.
        </p>
        <div className="flex flex-wrap gap-2 pt-1 text-xs">
          <Link
            href="/transactions/nba"
            className="rounded-full border border-neutral-200 dark:border-neutral-800 px-3 py-1 font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
          >
            🔄 NBA 트랜잭션
          </Link>
          <Link
            href="/leagues/NBA"
            className="rounded-full border border-neutral-200 dark:border-neutral-800 px-3 py-1 font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
          >
            🏀 NBA 경기·순위
          </Link>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-400">연봉 데이터를 불러오는 중입니다.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 text-xs text-neutral-500">
                <th className="px-3 py-2.5 text-center font-semibold w-10">#</th>
                <th className="px-2 py-2.5 text-left font-semibold" colSpan={2}>선수</th>
                <th className="px-2 py-2.5 text-left font-semibold">팀</th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">연봉</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const top3 = r.rank <= 3;
                const info = lookupNbaPlayer(r.playerName);
                const display = info?.ko ?? r.playerName;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-neutral-100 dark:border-neutral-800/60 last:border-0 hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition"
                  >
                    <td className="px-3 py-2.5 text-center tabular-nums font-bold text-neutral-400">{r.rank}</td>
                    <td className="pl-2 py-1.5 w-9">
                      <PlayerAvatar photo={info?.photo} name={display} />
                    </td>
                    <td className="pr-2 py-2.5">
                      <span className={`font-semibold ${top3 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                        {display}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-neutral-500">{toKoreanTeamName(r.teamName, "NBA")}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold whitespace-nowrap" title={fmtFull(r.salary)}>
                      {fmtUsd(r.salary)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <footer className="border-t border-neutral-200 dark:border-neutral-800 pt-4 text-xs text-neutral-400 leading-relaxed">
        상위 10명 합계 약 {fmtUsd(totalTop)}. 연봉은 해당 시즌 실계약액(USD) 기준. 데이터 제공{" "}
        <a href="https://www.basketball-reference.com/contracts/players.html" target="_blank" rel="nofollow noopener" className="text-blue-600 dark:text-blue-400 hover:underline">
          Basketball Reference
        </a>
        .
      </footer>
    </main>
  );
}
