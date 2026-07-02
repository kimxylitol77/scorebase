// 2026 월드컵 대진표 임베드 위젯 — 외부 블로그가 iframe 으로 붙이는 화면(사이트 chrome 없음).
// 출처 링크(제공: 스코어베이스)를 노출해 클릭·백링크 유도. 본문은 /world-cup 대진표 탭과 동일 데이터.
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import WcBracket from "@/components/world-cup/WcBracket";
import { buildWcBracket, parseKnockoutRound, type WcKnockoutFixture } from "@/lib/predict/wc-bracket";
import { getWcGroupStandings } from "@/lib/sports/world-cup-standings";

export const revalidate = 600;

const SITE_URL = process.env.SITE_URL ?? "https://www.scorebase.kr";

export const metadata: Metadata = {
  title: "2026 월드컵 대진표 위젯",
  robots: { index: false, follow: true },
};

export default async function WcBracketEmbed() {
  const teams = await prisma.team.findMany({ where: { league: "WORLD_CUP" }, select: { id: true, name: true } });
  const koreaTeamId = teams.find((t) => t.name === "South Korea")?.id ?? null;

  const [standings, knockoutRows] = await Promise.all([
    getWcGroupStandings(),
    prisma.match.findMany({
      where: { league: "WORLD_CUP", startTime: { gte: new Date("2026-06-28T00:00:00Z") } },
      select: {
        externalId: true, startTime: true, status: true, homeScore: true, awayScore: true,
        homeTeamId: true, awayTeamId: true, raw: true,
        homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } },
      },
    }),
  ]);

  const knockout: WcKnockoutFixture[] = [];
  for (const m of knockoutRows) {
    let roundStr: string | null = null;
    let winnerId: number | null = null;
    try {
      const j = JSON.parse(m.raw ?? "{}");
      roundStr = j?.league?.round ?? null;
      if (j?.teams?.home?.winner === true) winnerId = m.homeTeamId;
      else if (j?.teams?.away?.winner === true) winnerId = m.awayTeamId;
    } catch {}
    const round = parseKnockoutRound(roundStr);
    if (!round) continue;
    knockout.push({
      round, homeName: m.homeTeam.name, awayName: m.awayTeam.name,
      homeId: m.homeTeamId, awayId: m.awayTeamId, homeScore: m.homeScore, awayScore: m.awayScore,
      status: m.status, startTime: m.startTime.toISOString(), externalId: m.externalId, winnerId,
    });
  }

  const slots = buildWcBracket({
    groupStandings: standings,
    teamIdByName: new Map(teams.map((t) => [t.name, t.id])),
    knockout,
  });

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 px-3 py-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h1 className="text-base sm:text-lg font-bold tracking-tight">2026 월드컵 대진표 · 32강~결승</h1>
          <Link
            href={`${SITE_URL}/world-cup?view=bracket`}
            target="_blank"
            className="shrink-0 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline"
          >
            실시간 보기 →
          </Link>
        </div>
        <WcBracket slots={slots} koreaTeamId={koreaTeamId} />
        {/* 출처 — 임베드 화면 하단 고정 백링크 */}
        <div className="mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-800 text-center text-[11px] text-neutral-500">
          제공 ·{" "}
          <Link href={`${SITE_URL}/world-cup`} target="_blank" className="font-semibold text-neutral-700 dark:text-neutral-200 hover:underline">
            스코어베이스 — 2026 월드컵 데이터 센터
          </Link>
        </div>
      </div>
    </div>
  );
}
