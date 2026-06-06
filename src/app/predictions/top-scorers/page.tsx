// /predictions/top-scorers — 리그별 득점왕·도움왕 (현 시즌). player-season-stats.json(골/도움) 기반.
import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, Goal } from "lucide-react";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import rawSeason from "../../../../data/player-season-stats.json";
import rawOverrides from "../../../../data/player-overrides.json";
import rawPhotos from "../../../../data/player-photos.json";

export const dynamic = "force-dynamic";

interface SeasonStat { lg: string; team: string | null; goals: number | null; assists: number | null; matches: number | null }
const SEASON = rawSeason as Record<string, SeasonStat>;
const OVERRIDES = rawOverrides as Record<string, { nameKo?: string }>;
const PHOTOS = rawPhotos as Record<string, string>;

const LEAGUES: { code: string; label: string }[] = [
  { code: "EPL", label: "EPL" },
  { code: "LALIGA", label: "라리가" },
  { code: "BUNDESLIGA", label: "분데스리가" },
  { code: "LIGUE_1", label: "리그 1" },
];

export const metadata: Metadata = {
  title: "리그별 득점왕·도움왕 — 축구 득점 순위 | 스코어베이스",
  description: "EPL·라리가·분데스리가·리그1 현 시즌 득점왕과 도움왕 순위. 골·도움 누적 순위를 한눈에. 스코어베이스.",
  keywords: ["득점왕", "도움왕", "축구 득점 순위", "EPL 득점왕", "라리가 득점왕", "스코어베이스"],
  alternates: { canonical: "/predictions/top-scorers" },
};

export default async function TopScorersPage() {
  // 표시 대상 id 수집 → 이름 조회
  const entries = Object.entries(SEASON);
  const byLeague = LEAGUES.map((lg) => {
    const inLg = entries.filter(([, s]) => s.lg === lg.code);
    const scorers = inLg.filter(([, s]) => (s.goals ?? 0) > 0).sort((a, b) => (b[1].goals ?? 0) - (a[1].goals ?? 0)).slice(0, 10);
    const assisters = inLg.filter(([, s]) => (s.assists ?? 0) > 0).sort((a, b) => (b[1].assists ?? 0) - (a[1].assists ?? 0)).slice(0, 10);
    return { lg, scorers, assisters };
  });
  const ids = [...new Set(byLeague.flatMap((l) => [...l.scorers, ...l.assisters].map(([id]) => id)))];
  const tsp = await prisma.theSportsPlayer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, nameKo: true } });
  const nameMap = new Map(tsp.map((p) => [p.id, p]));
  const nameOf = (id: string) => OVERRIDES[id]?.nameKo || nameMap.get(id)?.nameKo || nameMap.get(id)?.name || "선수";

  const Row = ({ id, stat, val }: { id: string; stat: SeasonStat; val: number }) => (
    <Link href={`/transfers/${id}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-black/[0.03] dark:hover:bg-white/[0.05]">
      <span className="w-5 shrink-0 text-right tabular-nums text-xs font-bold text-zinc-400 dark:text-white/40">{val}</span>
      {PHOTOS[id] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={PHOTOS[id]} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-black/5" />
      ) : (
        <span className="w-7 h-7 rounded-full bg-neutral-200 dark:bg-neutral-800 shrink-0" />
      )}
      <span className="flex-1 min-w-0">
        <span className="block truncate text-sm text-zinc-800 dark:text-white/85">{nameOf(id)}</span>
        <span className="block truncate text-[11px] text-zinc-400">{toKoreanTeamName(stat.team) || stat.team}</span>
      </span>
    </Link>
  );

  return (
    <div className="relative min-h-screen bg-[#f5f5f7] dark:bg-transparent">
      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-10 sm:py-14">
        <Link href="/predictions" className="inline-flex items-center gap-1 text-sm text-zinc-500 transition hover:text-zinc-900 dark:text-white/45 dark:hover:text-white">
          <ChevronLeft className="h-4 w-4" /> 예측 대시보드
        </Link>
        <h1 className="mt-4 flex items-center gap-2 text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
          <Goal className="h-6 w-6 text-zinc-500 dark:text-white/50" />
          득점왕 · 도움왕
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-white/50">유럽 빅5 리그 현 시즌 득점·도움 순위. (세리에 A는 다음 시즌 개막 후)</p>

        <div className="mt-6 space-y-8">
          {byLeague.map(({ lg, scorers, assisters }) => (
            <div key={lg.code}>
              <h2 className="mb-3 text-lg font-bold text-zinc-900 dark:text-white">{lg.label}</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-2xl bg-white p-3 sm:p-4 shadow-sm ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
                  <div className="mb-1.5 px-2 text-xs font-bold uppercase tracking-wider text-zinc-500">⚽ 득점왕</div>
                  {scorers.length ? scorers.map(([id, s]) => <Row key={id} id={id} stat={s} val={s.goals ?? 0} />) : <p className="px-2 py-3 text-sm text-zinc-400">데이터 없음</p>}
                </div>
                <div className="rounded-2xl bg-white p-3 sm:p-4 shadow-sm ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
                  <div className="mb-1.5 px-2 text-xs font-bold uppercase tracking-wider text-zinc-500">🎯 도움왕</div>
                  {assisters.length ? assisters.map(([id, s]) => <Row key={id} id={id} stat={s} val={s.assists ?? 0} />) : <p className="px-2 py-3 text-sm text-zinc-400">데이터 없음</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
