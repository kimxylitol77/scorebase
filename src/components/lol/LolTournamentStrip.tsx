// LoL 리그 허브의 대회 줄 — 이 리그 라벨(LCK 등) 아래 실제로 치러진 대회들을 로고와 함께 보여준다.
// 우리 리그 코드 하나에 정규·컵·초청전이 섞이는데(실측 LOL = LCK 2026 · LCK Cup 2026 · KeSPA Cup 2026)
// 화면엔 전부 "LCK"로만 보여 구분이 안 됐다. 최근 경기부터 세어 진행 중인 대회를 앞에 둔다.
import { prisma } from "@/lib/db";
import { unstable_cache } from "next/cache";
import { lolTournamentOfMatch, type LolTournament } from "@/lib/sports/lol-tournaments";
import LolTournamentBadge from "./LolTournamentBadge";

const getTournaments = unstable_cache(
  async (league: string): Promise<Array<{ t: LolTournament; matches: number; latest: number }>> => {
    const since = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
    const matches = await prisma.match.findMany({
      where: { league, startTime: { gte: since } },
      select: { raw: true, startTime: true },
    });
    const acc = new Map<string, { t: LolTournament; matches: number; latest: number }>();
    for (const m of matches) {
      const t = lolTournamentOfMatch(m.raw);
      if (!t) continue;
      const e = acc.get(t.id) ?? { t, matches: 0, latest: 0 };
      e.matches++;
      e.latest = Math.max(e.latest, m.startTime.getTime());
      acc.set(t.id, e);
    }
    return [...acc.values()].sort((a, b) => b.latest - a.latest);
  },
  ["lol-tournament-strip"],
  { revalidate: 3600 },
);

export default async function LolTournamentStrip({ league }: { league: string }) {
  const rows = await getTournaments(league).catch(() => []);
  if (rows.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-1.5" aria-label="대회">
      <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">올해 대회</span>
      {rows.map((r) => (
        <span key={r.t.id} className="inline-flex items-center gap-1">
          <LolTournamentBadge tournament={r.t} />
          <span className="text-[11px] tabular-nums text-neutral-400">{r.matches}경기</span>
        </span>
      ))}
    </div>
  );
}
