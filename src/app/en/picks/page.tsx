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
import { displayGradeEn as displayGrade } from "@/lib/user-level";
import { settleFlatUnits, fmtRoiPct, fmtUnits, type FlatRoiResult } from "@/lib/predict/flat-roi";
import { roiClaim } from "@/lib/predict/model-vs-market";
import { resolveAvatar } from "@/lib/analysis/analysts";
import Avatar from "@/components/experts/Avatar";

export const metadata: Metadata = {
  title: "Predictions — You vs AI | Scorebase",
  description: "Predict today’s and tomorrow’s matches in one click; the odds at pick time are saved and every pick is scored for hit rate and unit return. Member rankings included.",
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

  // 내 기록 (로그인) — 적중률 + 플랫 유닛 수익률(flat-roi 단일 계산기, accuracy·/lab 과 같은 규칙) + 평균 CLV
  let myRecord: {
    total: number; scored: number; hit: number;
    /** 픽 시점 배당으로 1유닛 후행 정산. excluded = 배당 없는 표(화면에 "제외" 로 표기) */
    roi: FlatRoiResult;
    /** 평균 CLV(%) — 종가 대비 픽 배당. 표본 수 함께 */
    avgClv: number | null; clvN: number;
  } | null = null;
  if (userId) {
    const all = await prisma.matchVote.findMany({
      where: { userId },
      select: { matchId: true, market: true, correct: true, pickOdds: true, clv: true },
    });
    const scoredRows = all.filter((v) => v.correct !== null);
    const clvRows = all.filter((v) => v.clv != null);
    myRecord = {
      total: all.length,
      scored: scoredRows.length,
      hit: scoredRows.filter((v) => v.correct).length,
      roi: settleFlatUnits(scoredRows.map((v) => ({ odds: v.pickOdds, won: v.correct === true }))),
      avgClv: clvRows.length > 0 ? (clvRows.reduce((a, v) => a + v.clv!, 0) / clvRows.length) * 100 : null,
      clvN: clvRows.length,
    };
  }
  // 기준선 — 모델 픽·시장 인기픽 플랫 ROI(홈 H1·accuracy 와 같은 캐시). 적중 수 비교("AI 를 이기는 중") 대신 수익률 잣대를 나란히.
  const baseline = await roiClaim();

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
      <h1 className="mt-3 text-2xl font-semibold text-neutral-900 dark:text-white">My pick record — predictions scored against the odds</h1>
      <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
        Predict today’s and tomorrow’s matches with one click. The average overseas odds at the moment you pick are saved with it, and after the final whistle each pick is scored for hit and unit profit. Voting also reveals our AI model’s pick.
        {!userId && <span className="ml-1">You can vote without signing in; sign in to have hit rate, return and ranking recorded.</span>}
      </p>

      {/* 내 기록 — 내 픽 · 적중률 · 평균 배당 · 누적 · 수익률 (+ 배당 없음 제외 표기) */}
      {myRecord && myRecord.total > 0 && (
        <div className="mt-5">
          <div className="flex flex-wrap gap-2">
            <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm dark:border-neutral-800 dark:bg-white/[0.04]">
              My pick <span className="font-bold text-neutral-900 dark:text-white">{myRecord.total}</span>
              {myRecord.scored < myRecord.total && <span className="ml-1 text-xs text-neutral-500">scored {myRecord.scored}</span>}
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm dark:border-neutral-800 dark:bg-white/[0.04]">
              accuracy{" "}
              <span className="font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                {myRecord.scored > 0 ? `${Math.round((myRecord.hit / myRecord.scored) * 100)}%` : "—"}
              </span>
              {myRecord.scored > 0 && <span className="ml-1 text-xs text-neutral-500">{myRecord.hit}/{myRecord.scored}</span>}
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm dark:border-neutral-800 dark:bg-white/[0.04]" title="Average of the pick-time overseas odds (margin included) across settled picks">
              Avg odds <span className="font-bold tabular-nums text-neutral-900 dark:text-white">{myRecord.roi.avgOdds == null ? "—" : myRecord.roi.avgOdds.toFixed(2)}</span>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm dark:border-neutral-800 dark:bg-white/[0.04]" title="Retrospective settlement assuming 1 unit per pick at the average overseas odds when you picked. For reference only — no returns are guaranteed.">
              Units{" "}
              <span className={`font-bold tabular-nums ${myRecord.roi.units >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {myRecord.roi.evaluated > 0 ? fmtUnits(myRecord.roi.units) : "—"}
              </span>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm dark:border-neutral-800 dark:bg-white/[0.04]" title="Cumulative units ÷ settled picks — the same calculation as the flat-unit return on /en/predictions/accuracy">
              Return{" "}
              <span className={`font-bold tabular-nums ${myRecord.roi.roi >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {myRecord.roi.evaluated > 0 ? fmtRoiPct(myRecord.roi.roi) : "—"}
              </span>
              <span className="ml-1 text-xs text-neutral-500 tabular-nums">{myRecord.roi.evaluated} picks settled</span>
            </div>
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
          </div>
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
            {myRecord.roi.excluded > 0 && <span className="mr-2">No odds: {myRecord.roi.excluded} excluded</span>}
            {baseline && (
              <>
                Baseline · model picks overall <span className="font-semibold text-neutral-700 dark:text-neutral-200">{baseline.modelPct}</span>
                {" · "}market favourite <span className="font-semibold text-neutral-700 dark:text-neutral-200">{baseline.marketPct}</span>
                {" — same yardstick (1 unit per pick) · "}
                <Link href="/predictions/accuracy" className="text-blue-600 hover:underline dark:text-blue-400">Returns board →</Link>
              </>
            )}
          </p>
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
