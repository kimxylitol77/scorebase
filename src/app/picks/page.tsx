// /picks — 승부예측 허브: 오늘·내일 경기 원클릭 투표 + 내 적중 기록 + 회원 랭킹 (나 vs AI)
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { toKoreanTeamName } from "@/lib/team-names";
import MatchVoteButtons from "@/components/MatchVoteButtons";

export const metadata: Metadata = {
  title: "승부예측 — 나 vs AI | Scorebase",
  description: "오늘·내일 경기를 원클릭으로 예측하고 AI 모델과 적중률을 겨뤄보세요. 회원 적중 랭킹 제공.",
};
export const dynamic = "force-dynamic";

// 투표 대상 리그 — 예측 모델이 돌고 한국 수요가 있는 주요 리그
const PICK_LEAGUES = [
  "WORLD_CUP", "KBO", "MLB", "NPB", "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1",
  "MLS", "UCL", "UEL", "CLUB_WORLD_CUP", "K_LEAGUE_1", "NBA", "NHL",
];
const DRAW_LEAGUES = new Set([
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL", "UEL", "WORLD_CUP",
  "CLUB_WORLD_CUP", "K_LEAGUE_1", "KBO", "NPB",
]);
const LEAGUE_KO: Record<string, string> = {
  WORLD_CUP: "월드컵", KBO: "KBO", MLB: "MLB", NPB: "NPB", EPL: "EPL", LALIGA: "라리가",
  BUNDESLIGA: "분데스리가", SERIE_A: "세리에 A", LIGUE_1: "리그 1", MLS: "MLS", UCL: "UCL", UEL: "UEL",
  CLUB_WORLD_CUP: "클럽 월드컵", K_LEAGUE_1: "K리그1", NBA: "NBA", NHL: "NHL",
};

function kstTime(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const day = ["일", "월", "화", "수", "목", "금", "토"][k.getUTCDay()];
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()}(${day}) ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

export default async function PicksPage() {
  const userId = await getCurrentUserId();
  const now = new Date();
  const until = new Date(now.getTime() + 48 * 3600 * 1000);

  const matches = await prisma.match.findMany({
    where: { league: { in: PICK_LEAGUES }, status: "SCHEDULED", startTime: { gt: now, lte: until } },
    select: {
      id: true, league: true, startTime: true,
      predHome: true, predDraw: true, predAway: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
    orderBy: { startTime: "asc" },
    take: 40,
  });
  const ids = matches.map((m) => m.id);

  const [voteRows, myVotes] = await Promise.all([
    ids.length
      ? prisma.matchVote.groupBy({ by: ["matchId", "pick"], where: { matchId: { in: ids } }, _count: { _all: true } })
      : Promise.resolve([]),
    userId && ids.length
      ? prisma.matchVote.findMany({ where: { userId, matchId: { in: ids } }, select: { matchId: true, pick: true } })
      : Promise.resolve([]),
  ]);
  const distByMatch = new Map<number, Record<string, number>>();
  for (const r of voteRows) {
    const d = distByMatch.get(r.matchId) ?? { home: 0, draw: 0, away: 0 };
    d[r.pick] = r._count._all;
    distByMatch.set(r.matchId, d);
  }
  const myPickByMatch = new Map(myVotes.map((v) => [v.matchId, v.pick]));

  // 내 기록 (로그인) — 채점된 투표의 적중률 + 같은 경기에서 AI(predCorrect) 와 비교
  let myRecord: { total: number; scored: number; hit: number; aiHit: number } | null = null;
  if (userId) {
    const all = await prisma.matchVote.findMany({ where: { userId }, select: { matchId: true, correct: true } });
    const scoredRows = all.filter((v) => v.correct !== null);
    let aiHit = 0;
    if (scoredRows.length) {
      const aiRows = await prisma.match.findMany({
        where: { id: { in: scoredRows.map((v) => v.matchId) }, predCorrect: { not: null } },
        select: { predCorrect: true },
      });
      aiHit = aiRows.filter((m) => m.predCorrect).length;
    }
    myRecord = {
      total: all.length,
      scored: scoredRows.length,
      hit: scoredRows.filter((v) => v.correct).length,
      aiHit,
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
    ? await prisma.user.findMany({ where: { id: { in: board.map((b) => b.userId) } }, select: { id: true, nickname: true } })
    : [];
  const nickById = new Map(boardUsers.map((u) => [u.id, u.nickname]));

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <span className="inline-block rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-300 dark:ring-rose-500/30">
        승부예측
      </span>
      <h1 className="mt-3 text-2xl font-semibold text-neutral-900 dark:text-white">나 vs AI — 누가 더 잘 맞힐까</h1>
      <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
        오늘·내일 경기를 원클릭으로 예측해 보세요. 투표하면 우리 AI 모델의 픽이 공개되고, 경기 종료 후 자동 채점됩니다.
        {!userId && <span className="ml-1">비로그인도 투표할 수 있고, 로그인하면 적중률·랭킹에 기록됩니다.</span>}
      </p>

      {/* 내 기록 */}
      {myRecord && myRecord.total > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm dark:border-neutral-800 dark:bg-white/[0.04]">
            내 투표 <span className="font-bold text-neutral-900 dark:text-white">{myRecord.total}</span>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm dark:border-neutral-800 dark:bg-white/[0.04]">
            적중 <span className="font-bold text-rose-600 dark:text-rose-400">{myRecord.hit}</span>
            <span className="text-neutral-400">/{myRecord.scored}</span>
            {myRecord.scored > 0 && (
              <span className="ml-1 text-xs text-neutral-500">({Math.round((myRecord.hit / myRecord.scored) * 100)}%)</span>
            )}
          </div>
          {myRecord.scored > 0 && (
            <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm dark:border-neutral-800 dark:bg-white/[0.04]">
              같은 경기 AI 적중 <span className="font-bold text-neutral-900 dark:text-white">{myRecord.aiHit}</span>
              <span className="ml-1 text-xs font-medium">
                {myRecord.hit > myRecord.aiHit ? (
                  <span className="text-emerald-600 dark:text-emerald-400">AI 를 이기는 중!</span>
                ) : myRecord.hit === myRecord.aiHit ? (
                  <span className="text-neutral-500">AI 와 동률</span>
                ) : (
                  <span className="text-neutral-500">AI 가 우세</span>
                )}
              </span>
            </div>
          )}
          <Link
            href="/picks/me"
            className="flex items-center rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
          >
            내 예측 리포트 →
          </Link>
        </div>
      )}

      {/* 투표 목록 */}
      <section className="mt-7">
        <h2 className="text-sm font-bold text-neutral-900 dark:text-white">투표 가능한 경기 · {matches.length}</h2>
        {matches.length === 0 ? (
          <p className="mt-2 rounded-xl border border-neutral-200 bg-white px-4 py-10 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:bg-white/[0.04]">
            48시간 내 예정 경기가 없습니다. 잠시 후 다시 확인해주세요.
          </p>
        ) : (
          <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
            {matches.map((m) => {
              const lg = m.league ?? "";
              const home = toKoreanTeamName(m.homeTeam.name, lg) || m.homeTeam.name;
              const away = toKoreanTeamName(m.awayTeam.name, lg) || m.awayTeam.name;
              let aiPick: string | null = null;
              let aiProb: number | null = null;
              if (m.predHome != null && m.predAway != null) {
                const cands: [string, number][] = [
                  ["home", m.predHome],
                  ["away", m.predAway],
                  ...(m.predDraw != null ? ([["draw", m.predDraw]] as [string, number][]) : []),
                ];
                cands.sort((a, b) => b[1] - a[1]);
                aiPick = cands[0][0];
                aiProb = cands[0][1];
              }
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
                    dist={distByMatch.get(m.id) ?? { home: 0, draw: 0, away: 0 }}
                    myPick={myPickByMatch.get(m.id) ?? null}
                    loggedIn={!!userId}
                    aiPick={aiPick}
                    aiProb={aiProb}
                    result={null}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 랭킹 */}
      <section className="mt-8">
        <h2 className="text-sm font-bold text-neutral-900 dark:text-white">적중 랭킹</h2>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">채점된 투표 3개 이상인 회원만 집계됩니다.</p>
        {board.length === 0 ? (
          <p className="mt-2 rounded-xl border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:bg-white/[0.04]">
            아직 랭커가 없습니다. 첫 경기가 끝나면 채점이 시작됩니다 — 1위를 선점하세요.
          </p>
        ) : (
          <div className="mt-2 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500 dark:border-neutral-800 dark:bg-white/[0.04] dark:text-neutral-400">
                  <th className="px-3 py-2 font-medium">순위</th>
                  <th className="px-3 py-2 font-medium">회원</th>
                  <th className="px-3 py-2 text-right font-medium">적중</th>
                  <th className="px-3 py-2 text-right font-medium">적중률</th>
                </tr>
              </thead>
              <tbody>
                {board.map((b, i) => (
                  <tr key={b.userId} className={`border-b border-neutral-100 last:border-0 dark:border-neutral-800/60 ${b.userId === userId ? "bg-rose-500/5" : ""}`}>
                    <td className="px-3 py-2.5 font-medium text-neutral-900 dark:text-white">{i + 1}</td>
                    <td className="px-3 py-2.5 text-neutral-700 dark:text-neutral-200">{nickById.get(b.userId) ?? "회원"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-neutral-600 dark:text-neutral-300">{b.hit}/{b.total}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-neutral-900 dark:text-white">{Math.round((b.hit / b.total) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
