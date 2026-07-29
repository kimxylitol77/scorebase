// /predictions/starters — 오늘·내일 선발 투수 매치업 보드 (KBO·MLB·NPB).
// 데이터: Match.homeStarter/awayStarter JSON (baseball-starters·mlb-starters cron 이 채움).
// ERA·WHIP·K9 비교 + 최근 3등판 폼(KBO·MLB) + AI 승률 — 매치 상세(/live)로 클릭 이동.
import { prisma } from "@/lib/db";
import Link from "next/link";
import type { Metadata } from "next";
import StarterMatchupCard from "@/components/predictions/StarterMatchupCard";
import AmbientGlow from "@/components/AmbientGlow";

export const revalidate = 600; // ISR — 선발은 cron(12:00·12:30) 갱신, 10분 캐시로 충분

export const metadata: Metadata = {
  title: "오늘의 선발 투수 매치업 — KBO·MLB·NPB | Scorebase",
  description:
    "오늘과 내일 KBO·MLB·NPB 선발 투수 맞대결을 한눈에 — ERA·WHIP·K/9·최근 3등판 폼 비교와 AI 승률까지. 매일 자동 갱신되는 선발 매치업 보드.",
  keywords: ["KBO 선발 투수", "MLB 선발 투수", "오늘 선발 라인업", "선발 매치업", "투수 맞대결", "스코어베이스"],
  alternates: { canonical: "/predictions/starters" },
};

const LEAGUES = ["KBO", "MLB", "NPB"] as const;
const LEAGUE_LABEL: Record<string, string> = { KBO: "KBO", MLB: "MLB", NPB: "NPB" };

export default async function StartersPage() {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 3600_000);
  const todayKst = kstNow.toISOString().slice(0, 10);
  const tomorrowKst = new Date(kstNow.getTime() + 86400_000).toISOString().slice(0, 10);
  const rangeStart = new Date(`${todayKst}T00:00:00+09:00`);
  const rangeEnd = new Date(`${tomorrowKst}T23:59:59+09:00`);

  const matches = await prisma.match.findMany({
    where: {
      league: { in: LEAGUES as unknown as never },
      startTime: { gte: rangeStart, lte: rangeEnd },
      status: { in: ["SCHEDULED", "LIVE", "FINISHED"] },
    },
    select: {
      id: true,
      externalId: true,
      league: true,
      startTime: true,
      status: true,
      predHome: true,
      predAway: true,
      homeScore: true,
      awayScore: true,
      homeStarter: true,
      awayStarter: true,
      homeTeam: { select: { name: true, logoUrl: true } },
      awayTeam: { select: { name: true, logoUrl: true } },
    },
    orderBy: { startTime: "asc" },
  });

  const days: { date: string; label: string }[] = [
    { date: todayKst, label: `오늘 (${todayKst.slice(5).replace("-", "/")})` },
    { date: tomorrowKst, label: `내일 (${tomorrowKst.slice(5).replace("-", "/")})` },
  ];
  const kstDateOf = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

  return (
    <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <AmbientGlow />
      <nav className="text-xs text-neutral-500 mb-3">
        <Link href="/predictions/KBO" className="hover:text-neutral-700 dark:hover:text-neutral-300">예측</Link>
        <span className="mx-1">›</span>
        <span className="text-neutral-700 dark:text-neutral-300">선발 매치업</span>
      </nav>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 선발 매치업
      </span>
      <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">오늘의 선발 투수 매치업</h1>
      <p className="mt-3 text-sm text-neutral-600 leading-relaxed break-keep dark:text-neutral-400">
        KBO · MLB · NPB 선발 맞대결 — <strong>ERA · WHIP · K/9</strong> 와 최근 3등판 폼, AI 승률까지 한눈에.
        선발 발표 시 자동 갱신됩니다. <span className="text-emerald-600 dark:text-emerald-400 font-semibold">초록</span> = 해당 지표 우위.
        투수를 누르면 개인 카드로, 지표를 누르면 경기 상세로 이동합니다.
      </p>

      {days.map(({ date, label }) => {
        const dayMatches = matches.filter((m) => kstDateOf(m.startTime) === date);
        if (dayMatches.length === 0) return null;
        return (
          <div key={date} className="mt-8">
            <h2 className="text-lg font-bold mb-3">{label}</h2>
            {LEAGUES.map((lg) => {
              const lgMatches = dayMatches.filter((m) => m.league === lg);
              if (lgMatches.length === 0) return null;
              return (
                <div key={lg} className="mb-6">
                  <div className="text-xs font-bold tracking-widest text-neutral-400 mb-2">{LEAGUE_LABEL[lg]}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {lgMatches.map((m) => (
                      <StarterMatchupCard key={m.id} m={m} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {matches.length === 0 && (
        <div className="mt-10 rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-12 text-center text-sm text-neutral-500">
          오늘·내일 예정된 야구 경기가 없습니다.
        </div>
      )}

      <p className="mt-8 text-[11px] text-neutral-500 leading-relaxed">
        ⓘ 선발 정보는 구단 발표 후 자동 수집됩니다 (KBO·NPB 당일 오전 · MLB 수일 전 확정). ERA·WHIP·K/9 는 시즌 누적,
        최근 3등판 폼은 KBO·MLB 만 제공. AI 승률은 선발 능력치가 반영된 자체 모델 추정입니다.
      </p>
    </div>
  );
}
