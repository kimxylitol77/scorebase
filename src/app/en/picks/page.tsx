// /en/picks — 승부예측(영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getCurrentUserId } from "@/lib/current-user";
import { toEnglishTeamName } from "@/lib/i18n/en";
import MatchVoteButtons from "@/components/en/MatchVoteButtons";
import { buildVoteMarkets, loadVoteDists, VOTE_MATCH_SELECT } from "@/components/en/MatchVoteCard";
import { MARKET_LABEL_EN as MARKET_LABEL, type VoteMarket } from "@/lib/vote-markets";
import { displayGrade } from "@/lib/user-level";
import { resolveAvatar } from "@/lib/analysis/analysts";
import Avatar from "@/components/experts/Avatar";

export const metadata: Metadata = {
  title: "Predictions — You vs AI | Scorebase",
  description: "Predict today’s and tomorrow’s matches with one click and compete with the AI model on accuracy. Member ranking included.",
};
export const dynamic = "force-dynamic";

// 투표 대상 리그 — 예측 모델이 돌고 한국 수요가 있는 주요 리그
const PICK_LEAGUES = [
  "WORLD_CUP", "KBO", "MLB", "NPB", "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1",
  "MLS", "UCL", "UEL", "UECL", "CLUB_WORLD_CUP", "K_LEAGUE_1", "NBA", "NHL",
];
const DRAW_LEAGUES = new Set([
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL", "UEL", "UECL", "WORLD_CUP",
  "CLUB_WORLD_CUP", "K_LEAGUE_1", "KBO", "NPB",
]);
const LEAGUE_KO: Record<string, string> = {
  WORLD_CUP: "World Cup", KBO: "KBO", MLB: "MLB", NPB: "NPB", EPL: "EPL", LALIGA: "LaLiga",
  BUNDESLIGA: "Bundesliga", SERIE_A: "Serie A", LIGUE_1: "Ligue 1", MLS: "MLS", UCL: "UCL", UEL: "UEL", UECL: "UECL",
  CLUB_WORLD_CUP: "Club World Cup", K_LEAGUE_1: "K League 1", NBA: "NBA", NHL: "NHL",
};

function kstTime(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][k.getUTCDay()];
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()}(${day}) ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

export default async function PicksPage() {
  const userId = await getCurrentUserId();
  const now = new Date();
  const until = new Date(now.getTime() + 48 * 3600 * 1000);

  const matches = await prisma.match.findMany({
    where: { league: { in: PICK_LEAGUES }, status: "SCHEDULED", startTime: { gt: now, lte: until } },
    select: VOTE_MATCH_SELECT,
    orderBy: { startTime: "asc" },
    take: 40,
  });
  const ids = matches.map((m) => m.id);

  const [distByMatch, myVotes] = await Promise.all([
    loadVoteDists(ids),
    userId && ids.length
      ? prisma.matchVote.findMany({ where: { userId, matchId: { in: ids } }, select: { matchId: true, market: true, pick: true } })
      : Promise.resolve([]),
  ]);
  // 내 픽 — 매치 → 시장 → 픽
  const myPicksByMatch = new Map<number, Partial<Record<VoteMarket, string>>>();
  for (const v of myVotes) {
    const o = myPicksByMatch.get(v.matchId) ?? {};
    o[v.market as VoteMarket] = v.pick;
    myPicksByMatch.set(v.matchId, o);
  }

  // 내 기록 (로그인) — 채점된 투표의 적중률 + 같은 경기에서 AI(predCorrect) 와 비교
  let myRecord: {
    total: number; scored: number; hit: number; aiHit: number;
    /** 플랫 1유닛 후행 시뮬 — 픽 배당 있는 채점 표만. 참고용, 수익 보장 아님 */
    units: number; unitsN: number; roi: number | null; avgOdds: number | null;
    /** 평균 CLV(%) — 종가 대비 픽 배당. 표본 수 함께 */
    avgClv: number | null; clvN: number;
  } | null = null;
  if (userId) {
    const all = await prisma.matchVote.findMany({
      where: { userId },
      select: { matchId: true, market: true, correct: true, pickOdds: true, clv: true },
    });
    const scoredRows = all.filter((v) => v.correct !== null);
    let aiHit = 0;
    if (scoredRows.length) {
      const aiRows = await prisma.match.findMany({
        where: { id: { in: scoredRows.map((v) => v.matchId) }, predCorrect: { not: null } },
        select: { predCorrect: true },
      });
      aiHit = aiRows.filter((m) => m.predCorrect).length;
    }
    const priced = scoredRows.filter((v) => v.pickOdds != null && v.pickOdds > 1);
    const units = priced.reduce((acc, v) => acc + (v.correct ? v.pickOdds! - 1 : -1), 0);
    const clvRows = all.filter((v) => v.clv != null);
    myRecord = {
      total: all.length,
      scored: scoredRows.length,
      hit: scoredRows.filter((v) => v.correct).length,
      aiHit,
      units,
      unitsN: priced.length,
      roi: priced.length > 0 ? units / priced.length : null,
      avgOdds: priced.length > 0 ? priced.reduce((a, v) => a + v.pickOdds!, 0) / priced.length : null,
      avgClv: clvRows.length > 0 ? (clvRows.reduce((a, v) => a + v.clv!, 0) / clvRows.length) * 100 : null,
      clvN: clvRows.length,
    };
  }

  // 회원 적중 랭킹 — 채점 3표 이상, 적중률순
  const board = await prisma.$queryRaw<{ userId: string; total: number; hit: number }[]>`
    SELECT "userId", COUNT(*)::int AS total, SUM(CASE WHEN correct THEN 1 ELSE 0 END)::int AS hit
    FROM "MatchVote"
    WHERE "userId" IS NOT NULL AND correct IS NOT NULL
    GROUP BY "userId"
    HAVING COUNT(*) >= 3
    ORDER BY SUM(CASE WHEN correct THEN 1 ELSE 0 END)::float / COUNT(*) DESC, COUNT(*) DESC
    LIMIT 20`;
  const boardUsers = board.length
    ? await prisma.user.findMany({
        where: { id: { in: board.map((b) => b.userId) } },
        select: { id: true, nickname: true, avatarUrl: true, level: true, badge: true, avatarFrame: true },
      })
    : [];
  const userById = new Map(boardUsers.map((u) => [u.id, u]));
  // 시장별 적중(승부·핸디·오버언더) — 랭커마다 어느 시장에 강한지 한 줄 보조 표기.
  const perMarket = board.length
    ? await prisma.$queryRaw<{ userId: string; market: string; total: number; hit: number }[]>`
        SELECT "userId", market, COUNT(*)::int AS total, SUM(CASE WHEN correct THEN 1 ELSE 0 END)::int AS hit
        FROM "MatchVote"
        WHERE "userId" IN (${Prisma.join(board.map((b) => b.userId))}) AND correct IS NOT NULL
        GROUP BY "userId", market`
    : [];
  const marketByUser = new Map<string, { market: string; total: number; hit: number }[]>();
  for (const r of perMarket) {
    const arr = marketByUser.get(r.userId) ?? [];
    arr.push(r);
    marketByUser.set(r.userId, arr);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <span className="inline-block rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-300 dark:ring-rose-500/30">
        Predictions
      </span>
      <h1 className="mt-3 text-2xl font-semibold text-neutral-900 dark:text-white">You vs AI — who calls it better?</h1>
      <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
        Predict today’s and tomorrow’s matches with one click. Voting reveals our AI model’s pick, and results are scored automatically after the match.
        {!userId && <span className="ml-1">You can vote without signing in; sign in to record accuracy and rank.</span>}
      </p>

      {/* 내 기록 */}
      {myRecord && myRecord.total > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm dark:border-neutral-800 dark:bg-white/[0.04]">
            My votes <span className="font-bold text-neutral-900 dark:text-white">{myRecord.total}</span>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm dark:border-neutral-800 dark:bg-white/[0.04]">
            hits <span className="font-bold text-rose-600 dark:text-rose-400">{myRecord.hit}</span>
            <span className="text-neutral-400">/{myRecord.scored}</span>
            {myRecord.scored > 0 && (
              <span className="ml-1 text-xs text-neutral-500">({Math.round((myRecord.hit / myRecord.scored) * 100)}%)</span>
            )}
          </div>
          {myRecord.roi != null && (
            <div
              className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm dark:border-neutral-800 dark:bg-white/[0.04]"
              title="Backtest assuming 1 unit per match at the average overseas odds when you picked. For reference only — no returns are guaranteed."
            >
              P/L <span className={`font-bold tabular-nums ${myRecord.units >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {myRecord.units >= 0 ? "+" : ""}{myRecord.units.toFixed(1)}u
              </span>
              <span className="ml-1 text-xs text-neutral-500 tabular-nums">
                ROI {myRecord.roi >= 0 ? "+" : ""}{(myRecord.roi * 100).toFixed(1)}% · avg odds {myRecord.avgOdds!.toFixed(2)} · {myRecord.unitsN} votes
              </span>
            </div>
          )}
          {myRecord.avgClv != null && (
            <div
              className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm dark:border-neutral-800 dark:bg-white/[0.04]"
              title="CLV (Closing Line Value) — how much better your odds were than the closing line at kick-off. Consistently positive means you moved before the market."
            >
              Avg CLV <span className={`font-bold tabular-nums ${myRecord.avgClv >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {myRecord.avgClv >= 0 ? "+" : ""}{myRecord.avgClv.toFixed(1)}%
              </span>
              <span className="ml-1 text-xs text-neutral-500">{myRecord.clvN} votes · vs closing</span>
            </div>
          )}
          {myRecord.scored > 0 && (
            <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm dark:border-neutral-800 dark:bg-white/[0.04]">
              AI hits, same matches <span className="font-bold text-neutral-900 dark:text-white">{myRecord.aiHit}</span>
              <span className="ml-1 text-xs font-medium">
                {myRecord.hit > myRecord.aiHit ? (
                  <span className="text-emerald-600 dark:text-emerald-400">Beating the AI!</span>
                ) : myRecord.hit === myRecord.aiHit ? (
                  <span className="text-neutral-500">Level with AI</span>
                ) : (
                  <span className="text-neutral-500">AI ahead</span>
                )}
              </span>
            </div>
          )}
          <Link
            href="/en/picks/me"
            className="flex items-center rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
          >
            My prediction report →
          </Link>
        </div>
      )}

      {/* 투표 목록 */}
      <section className="mt-7">
        <h2 className="text-sm font-bold text-neutral-900 dark:text-white">Open for votes · {matches.length}</h2>
        {matches.length === 0 ? (
          <p className="mt-2 rounded-xl border border-neutral-200 bg-white px-4 py-10 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:bg-white/[0.04]">
            No matches scheduled in the next 48 hours. Check back soon.
          </p>
        ) : (
          <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
            {matches.map((m) => {
              const lg = m.league ?? "";
              const home = toEnglishTeamName(m.homeTeam.name);
              const away = toEnglishTeamName(m.awayTeam.name);
              const markets = buildVoteMarkets(m, distByMatch.get(m.id) ?? {}, myPicksByMatch.get(m.id) ?? {});
              return (
                <div key={m.id} className="rounded-2xl border border-neutral-200/80 bg-white p-3.5 dark:border-white/10 dark:bg-white/[0.04]">
                  <div className="mb-2 flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
                    <span className="font-medium">{LEAGUE_KO[lg] ?? lg}</span>
                    <span className="tabular-nums">{kstTime(m.startTime)}</span>
                  </div>
                  <div className="mb-2 truncate text-sm font-semibold text-neutral-900 dark:text-white">
                    {home} <span className="font-normal text-neutral-400">vs</span> {away}
                  </div>
                  <MatchVoteButtons
                    matchId={m.id}
                    homeName={home}
                    awayName={away}
                    hasDraw={DRAW_LEAGUES.has(lg)}
                    closed={false}
                    markets={markets}
                    loggedIn={!!userId}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 랭킹 */}
      <section className="mt-8">
        <h2 className="text-sm font-bold text-neutral-900 dark:text-white">Accuracy ranking</h2>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Only members with 3+ scored votes are ranked. 1X2, handicap and over/under are combined; per-market hits appear under the name.</p>
        {board.length === 0 ? (
          <p className="mt-2 rounded-xl border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:bg-white/[0.04]">
            No rankers yet. Scoring starts after the first match ends — claim #1.
          </p>
        ) : (
          <div className="mt-2 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500 dark:border-neutral-800 dark:bg-white/[0.04] dark:text-neutral-400">
                  <th className="px-3 py-2 font-medium">Rank</th>
                  <th className="px-3 py-2 font-medium">Member</th>
                  <th className="px-3 py-2 text-right font-medium">hits</th>
                  <th className="px-3 py-2 text-right font-medium">accuracy</th>
                </tr>
              </thead>
              <tbody>
                {board.map((b, i) => {
                  const u = userById.get(b.userId);
                  const g = u ? displayGrade(u.level, u.badge) : null;
                  const avatar = u ? resolveAvatar(u.avatarUrl, u.nickname, u.level, u.badge) : null;
                  const mk = (marketByUser.get(b.userId) ?? []).filter((r) => r.total > 0);
                  const rankCls = i === 0 ? "text-amber-500" : i === 1 ? "text-neutral-400" : i === 2 ? "text-amber-700" : "text-neutral-900 dark:text-white";
                  return (
                  <tr key={b.userId} className={`border-b border-neutral-100 last:border-0 dark:border-neutral-800/60 ${b.userId === userId ? "bg-rose-500/5" : ""}`}>
                    <td className={`px-3 py-2.5 font-bold tabular-nums ${rankCls}`}>{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        {avatar && <Avatar avatar={avatar} size="sm" frame={u?.avatarFrame} />}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium text-neutral-800 dark:text-neutral-100">{u?.nickname ?? "Member"}</span>
                            {g && (
                              <span className="shrink-0 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600 dark:bg-white/[0.08] dark:text-neutral-300" title={`Lv.${u?.level ?? 1}`}>
                                {g.emoji} {g.name}
                              </span>
                            )}
                          </div>
                          {mk.length > 0 && (
                            <div className="mt-0.5 text-[10px] tabular-nums text-neutral-400 dark:text-neutral-500">
                              {mk.map((r) => `${MARKET_LABEL[r.market as VoteMarket] ?? r.market} ${r.hit}/${r.total}`).join(" · ")}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-neutral-600 dark:text-neutral-300">{b.hit}/{b.total}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-neutral-900 dark:text-white">{Math.round((b.hit / b.total) * 100)}%</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
