// /salaries/kbo — KBO 국내 선수 연봉 랭킹 (원화, 상위 큐레이션).
// 데이터: KBO 공식 + 언론 교차검증 → PlayerSalary(KBO) (만원 단위). 선수명·구단 한글 그대로.
// ⚠️ KBO 연봉 전체 DB 무료 소스 없음(statiz 로그인 벽) → 국내 선수 TOP 10 큐레이션. 외국인은 달러 별도라 제외.

import { prisma } from "@/lib/db";
import Link from "next/link";
import type { Metadata } from "next";
import { KBO_SALARY_PLAYER_IDS } from "@/lib/sports/kbo-salaries";
import AmbientGlow from "@/components/AmbientGlow";
import PlayerValueTabs from "@/components/PlayerValueTabs";
import { Trophy } from "lucide-react";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "KBO 선수 연봉 랭킹 — 2026 | 스코어베이스",
  description:
    "2026 KBO 프로야구 국내 선수 연봉 순위 — 양의지 42억 역대 최고, 고영표·최정·류현진·박세웅 등 TOP 10. 한국어 선수명·구단 표기. 데이터 KBO 공식·언론 종합.",
  alternates: { canonical: "https://www.scorebase.kr/salaries/kbo" },
};

/** 만원 단위 → 한국식 표기 ("42억" · "1억 5,000만원" · "9,000만원"). */
function fmtManwon(manwon: number): string {
  const eok = Math.floor(manwon / 10000);
  const rem = manwon % 10000;
  if (eok > 0 && rem > 0) return `${eok}억 ${rem.toLocaleString()}만원`;
  if (eok > 0) return `${eok}억원`;
  return `${manwon.toLocaleString()}만원`;
}

export default async function KboSalariesPage() {
  const rows = await prisma.playerSalary.findMany({
    where: { league: "KBO" },
    orderBy: { rank: "asc" },
  });
  const season = rows[0]?.season ?? "2026";

  // 선수 사진 = TheSportsPlayer(KBO) nameKo 매칭 (KBO 공식 이미지). 미매칭은 이니셜.
  const names = rows.map((r) => r.playerName);
  const tsP = names.length
    ? await prisma.theSportsPlayer.findMany({
        where: { sport: "KBO", nameKo: { in: names } },
        select: { nameKo: true, photoUrl: true },
      })
    : [];
  const photoOf = new Map(tsP.map((p) => [p.nameKo, p.photoUrl]));

  // 팀 로고 — Team(KBO) logoUrl. 약칭(두산)→풀네임(두산 베어스) 부분 매칭.
  const kboTeams = await prisma.team.findMany({ where: { league: "KBO" }, select: { name: true, logoUrl: true } });
  const teamLogoOf = (short: string): string | null =>
    kboTeams.find((t) => t.name.startsWith(short) || t.name.includes(short))?.logoUrl ?? null;

  return (
    <main className="relative max-w-3xl lg:max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <AmbientGlow />
      <PlayerValueTabs active="/salaries/kbo" />
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-neutral-400">
          <Link href="/scores" className="hover:underline">라이브 스코어</Link>
          <span>›</span>
          <Link href="/leagues/KBO" className="hover:underline">KBO</Link>
          <span>›</span>
          <span className="text-neutral-600 dark:text-neutral-300">연봉 랭킹</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 연봉 랭킹
        </span>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">KBO 연봉 랭킹</h1>
        <p className="text-sm text-neutral-500 leading-relaxed break-keep">
          {season} 시즌 국내 선수 연봉 순위. 양의지 42억 역대 최고 · 데이터 KBO 공식·언론 종합.
        </p>
        <div className="flex flex-wrap gap-2 pt-1 text-xs">
          <Link href="/leagues/KBO" className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 dark:border-neutral-800 px-3 py-1 font-medium text-neutral-600 dark:text-neutral-300 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-neutral-100 dark:hover:bg-white/[0.06]">
            <Trophy className="h-3.5 w-3.5" aria-hidden /> KBO 경기·순위
          </Link>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-400">연봉 데이터를 불러오는 중입니다.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:border-neutral-800 dark:bg-white/[0.04] dark:shadow-none">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-white/[0.03] text-xs text-neutral-500">
                <th className="px-3 py-2.5 text-center font-semibold w-12">#</th>
                <th className="px-2 py-2.5 text-left font-semibold">선수</th>
                <th className="px-3 py-2.5 text-left font-semibold hidden lg:table-cell">팀</th>
                <th className="px-3 py-2.5 text-left font-semibold hidden lg:table-cell">포지션</th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">연봉</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const top3 = r.rank <= 3;
                const pid = KBO_SALARY_PLAYER_IDS[r.playerName];
                const teamLogo = teamLogoOf(r.teamName);
                const cell = (
                  <div className="flex items-center gap-2.5">
                    <Avatar photo={photoOf.get(r.playerName)} name={r.playerName} />
                    <div className="leading-tight">
                      <span className={`font-semibold ${top3 ? "text-amber-600 dark:text-amber-400" : ""} ${pid ? "group-hover:underline" : ""}`}>{r.playerName}</span>
                      <div className="lg:hidden text-[11px] text-neutral-400">{r.teamName}{r.position ? ` · ${r.position}` : ""}</div>
                    </div>
                  </div>
                );
                return (
                  <tr key={r.id} className="border-b border-neutral-100 dark:border-neutral-800/60 last:border-0 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-neutral-50 dark:hover:bg-white/[0.04]">
                    <td className="px-3 py-2.5 text-center tabular-nums font-bold text-neutral-400">{r.rank}</td>
                    <td className="px-2 py-2.5">
                      {pid ? (
                        <Link href={`/players/${pid}?league=KBO`} className="group block" aria-label={`${r.playerName} 선수 페이지`}>
                          {cell}
                        </Link>
                      ) : (
                        cell
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-neutral-500 dark:text-neutral-400 whitespace-nowrap hidden lg:table-cell">
                      <span className="inline-flex items-center gap-1.5">
                        {teamLogo && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={teamLogo} alt="" className="w-5 h-5 object-contain shrink-0" />
                        )}
                        {r.teamName}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-neutral-500 dark:text-neutral-400 whitespace-nowrap hidden lg:table-cell">{r.position ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums font-bold">
                      {fmtManwon(r.salary)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <footer className="border-t border-neutral-200 dark:border-neutral-800 pt-4 text-xs text-neutral-400 leading-relaxed">
        연봉은 KBO 가 발표한 {season} 시즌 국내 선수 공시 연봉(계약금·인센티브 제외) 기준이며, 상위 선수 위주로 정리했습니다. 외국인 선수는 달러로 별도 공시되어 제외했습니다. 데이터 제공{" "}
        <a href="https://www.koreabaseball.com" target="_blank" rel="nofollow noopener" className="text-blue-600 dark:text-blue-400 hover:underline">
          KBO
        </a>
        {" 공식·언론 종합."}
      </footer>
    </main>
  );
}

/** 선수 아바타 — KBO 공식 이미지(TheSportsPlayer), 매칭 실패 시 한글 첫 글자 원형. */
function Avatar({ photo, name }: { photo?: string | null; name: string }) {
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt="" loading="lazy" className="h-7 w-7 lg:h-9 lg:w-9 rounded-full bg-neutral-100 dark:bg-neutral-800 object-cover object-top shrink-0" />;
  }
  const initial = name.trim().charAt(0);
  return (
    <span className="inline-flex h-7 w-7 lg:h-9 lg:w-9 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700 text-[11px] font-bold text-neutral-500 dark:text-neutral-300 shrink-0">
      {initial}
    </span>
  );
}
