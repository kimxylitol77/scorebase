// /picks — 승부예측 허브 = 내 픽 기록장: 오늘·내일 경기 원클릭 투표(픽 시점 배당 저장) + 적중률·유닛 수익률 + 회원 랭킹
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getCurrentUserId } from "@/lib/current-user";
import { toKoreanTeamName } from "@/lib/team-names";
import MatchVoteButtons from "@/components/MatchVoteButtons";
import { buildVoteMarkets, loadVoteDists, VOTE_MATCH_SELECT } from "@/components/MatchVoteCard";
import { MARKET_LABEL, type VoteMarket } from "@/lib/vote-markets";
import { displayGrade } from "@/lib/user-level";
import { settleFlatUnits, fmtRoiPct, fmtUnits, type FlatRoiResult } from "@/lib/predict/flat-roi";
import { roiClaim } from "@/lib/predict/model-vs-market";
import { resolveAvatar } from "@/lib/analysis/analysts";
import Avatar from "@/components/experts/Avatar";
import { Bot } from "lucide-react";

export const metadata: Metadata = {
  title: "승부예측 — 나 vs AI | Scorebase",
  description: "오늘·내일 경기를 원클릭으로 예측하면 픽 시점 배당이 저장되고, 종료 후 적중률과 유닛 수익률로 채점됩니다. 회원 랭킹 제공.",
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
  WORLD_CUP: "월드컵", KBO: "KBO", MLB: "MLB", NPB: "NPB", EPL: "EPL", LALIGA: "라리가",
  BUNDESLIGA: "분데스리가", SERIE_A: "세리에 A", LIGUE_1: "리그 1", MLS: "MLS", UCL: "UCL", UEL: "UEL", UECL: "UECL",
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
  // 회원 봇(/lab) 픽 — 카드마다 "누가 어디에 걸었나" 한 줄. 1X2 만 생성되므로 그대로.
  const activeBots = await prisma.memberBot.findMany({ where: { isActive: true }, select: { id: true, name: true, userId: true } });
  const botById = new Map(activeBots.map((b) => [b.id, b]));
  const botPicks = ids.length && activeBots.length
    ? await prisma.memberBotPick.findMany({
        where: { matchId: { in: ids }, botId: { in: activeBots.map((b) => b.id) }, market: "1X2" },
        select: { matchId: true, botId: true, pick: true },
      })
    : [];
  const botPicksByMatch = new Map<number, { name: string; pick: string }[]>();
  for (const p of botPicks) {
    const b = botById.get(p.botId);
    if (!b) continue;
    const arr = botPicksByMatch.get(p.matchId) ?? [];
    arr.push({ name: b.name, pick: p.pick });
    botPicksByMatch.set(p.matchId, arr);
  }
  const BOT_PICK_KO: Record<string, string> = { HOME: "홈", DRAW: "무", AWAY: "원정" };

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
  // 회원 봇도 같은 잣대(채점 3표 이상·적중률순)로 랭킹에 섞는다. 봇은 1X2 만 픽하므로 시장별 줄 대신 소유자 표기.
  const botBoard = activeBots.length
    ? await prisma.$queryRaw<{ botId: string; total: number; hit: number }[]>`
        SELECT "botId", COUNT(*)::int AS total, SUM(CASE WHEN correct THEN 1 ELSE 0 END)::int AS hit
        FROM "MemberBotPick"
        WHERE "botId" IN (${Prisma.join(activeBots.map((b) => b.id))}) AND correct IS NOT NULL AND market = '1X2'
        GROUP BY "botId"
        HAVING COUNT(*) >= 3`
    : [];
  const botOwnerIds = [...new Set(activeBots.map((b) => b.userId))];
  const botOwners = botOwnerIds.length
    ? await prisma.user.findMany({ where: { id: { in: botOwnerIds } }, select: { id: true, nickname: true } })
    : [];
  const ownerNick = new Map(botOwners.map((u) => [u.id, u.nickname]));
  type BoardRow =
    | { kind: "user"; key: string; userId: string; total: number; hit: number }
    | { kind: "bot"; key: string; botId: string; name: string; owner: string; total: number; hit: number };
  const rows: BoardRow[] = [
    ...board.map((b): BoardRow => ({ kind: "user", key: `u:${b.userId}`, userId: b.userId, total: b.total, hit: b.hit })),
    ...botBoard.map((b): BoardRow => {
      const bot = botById.get(b.botId)!;
      return { kind: "bot", key: `b:${b.botId}`, botId: b.botId, name: bot.name, owner: ownerNick.get(bot.userId) ?? "회원", total: b.total, hit: b.hit };
    }),
  ]
    .sort((a, b) => b.hit / b.total - a.hit / a.total || b.total - a.total)
    .slice(0, 20);
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
        승부예측
      </span>
      <h1 className="mt-3 text-2xl font-semibold text-neutral-900 dark:text-white">내 픽 기록장 — 배당 기준으로 채점받는 승부예측</h1>
      <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
        오늘·내일 경기를 원클릭으로 예측하면 픽 시점 해외 평균 배당이 함께 저장되고, 경기 종료 후 적중과 유닛 손익이 자동 채점됩니다. 투표하면 우리 AI 모델의 픽도 공개됩니다.
        {!userId && <span className="ml-1">비로그인도 투표할 수 있고, 로그인하면 적중률·수익률·랭킹에 기록됩니다.</span>}
      </p>

      {/* 내 기록 — 내 픽 · 적중률 · 평균 배당 · 누적 · 수익률 (+ 배당 없음 제외 표기) */}
      {myRecord && myRecord.total > 0 && (
        <div className="mt-5">
          <div className="flex flex-wrap gap-2">
            <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm dark:border-neutral-800 dark:bg-white/[0.04]">
              내 픽 <span className="font-bold text-neutral-900 dark:text-white">{myRecord.total}</span>
              {myRecord.scored < myRecord.total && <span className="ml-1 text-xs text-neutral-500">채점 {myRecord.scored}</span>}
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm dark:border-neutral-800 dark:bg-white/[0.04]">
              적중률{" "}
              <span className="font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                {myRecord.scored > 0 ? `${Math.round((myRecord.hit / myRecord.scored) * 100)}%` : "—"}
              </span>
              {myRecord.scored > 0 && <span className="ml-1 text-xs text-neutral-500">{myRecord.hit}/{myRecord.scored}</span>}
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm dark:border-neutral-800 dark:bg-white/[0.04]" title="정산에 들어간 표의 픽 시점 해외 평균 배당(마진 포함) 평균">
              평균 배당 <span className="font-bold tabular-nums text-neutral-900 dark:text-white">{myRecord.roi.avgOdds == null ? "—" : myRecord.roi.avgOdds.toFixed(2)}</span>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm dark:border-neutral-800 dark:bg-white/[0.04]" title="픽 시점 해외 평균 배당으로 매 표 1유닛을 걸었다고 가정한 후행 정산. 참고용이며 실제 수익을 보장하지 않습니다.">
              누적{" "}
              <span className={`font-bold tabular-nums ${myRecord.roi.units >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {myRecord.roi.evaluated > 0 ? fmtUnits(myRecord.roi.units) : "—"}
              </span>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm dark:border-neutral-800 dark:bg-white/[0.04]" title="누적 유닛 ÷ 정산 표 수 — /predictions/accuracy 「플랫 유닛 수익률」과 같은 계산">
              수익률{" "}
              <span className={`font-bold tabular-nums ${myRecord.roi.roi >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {myRecord.roi.evaluated > 0 ? fmtRoiPct(myRecord.roi.roi) : "—"}
              </span>
              <span className="ml-1 text-xs text-neutral-500 tabular-nums">{myRecord.roi.evaluated}표 정산</span>
            </div>
            {myRecord.avgClv != null && (
              <div
                className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm dark:border-neutral-800 dark:bg-white/[0.04]"
                title="CLV(Closing Line Value) — 내가 픽한 시점 배당이 킥오프 직전 종가보다 얼마나 좋았는지. 양수가 꾸준하면 시장보다 먼저 움직인 것."
              >
                평균 CLV <span className={`font-bold tabular-nums ${myRecord.avgClv >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                  {myRecord.avgClv >= 0 ? "+" : ""}{myRecord.avgClv.toFixed(1)}%
                </span>
                <span className="ml-1 text-xs text-neutral-500">{myRecord.clvN}표 · 종가 대비</span>
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
            {myRecord.roi.excluded > 0 && <span className="mr-2">배당 없음 {myRecord.roi.excluded}건 제외</span>}
            {baseline && (
              <>
                기준선 · 모델 픽 전체 <span className="font-semibold text-neutral-700 dark:text-neutral-200">{baseline.modelPct}</span>
                {" · "}시장 인기픽 <span className="font-semibold text-neutral-700 dark:text-neutral-200">{baseline.marketPct}</span>
                {" — 같은 잣대(1표 1유닛) · "}
                <Link href="/predictions/accuracy" className="text-blue-600 hover:underline dark:text-blue-400">수익률 보드 →</Link>
              </>
            )}
          </p>
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
                  {(() => {
                    const bp = botPicksByMatch.get(m.id);
                    if (!bp?.length) return null;
                    return (
                      <div className="mb-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                        <Bot className="h-3 w-3 text-violet-500" aria-hidden="true" />
                        <span className="font-medium">회원 봇</span>
                        {bp.map((p) => (
                          <span key={p.name} className="tabular-nums">
                            {p.name} <span className="font-semibold text-neutral-700 dark:text-neutral-200">{BOT_PICK_KO[p.pick] ?? p.pick}</span>
                          </span>
                        ))}
                      </div>
                    );
                  })()}
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
        <h2 className="text-sm font-bold text-neutral-900 dark:text-white">적중 랭킹</h2>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">채점된 투표 3개 이상인 회원만 집계됩니다. 승부·핸디캡·오버언더 세 시장 합산이며, 시장별 적중은 이름 아래에 표시됩니다. <Link href="/lab" className="text-blue-600 hover:underline dark:text-blue-400">회원 봇</Link>도 승부 픽 기준으로 같은 순위에 섞여 오릅니다.</p>
        {rows.length === 0 ? (
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
                {rows.map((b, i) => {
                  const rankCls = i === 0 ? "text-amber-500" : i === 1 ? "text-neutral-400" : i === 2 ? "text-amber-700" : "text-neutral-900 dark:text-white";
                  if (b.kind === "bot") {
                    return (
                      <tr key={b.key} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60">
                        <td className={`px-3 py-2.5 font-bold tabular-nums ${rankCls}`}>{i + 1}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-300">
                              <Bot className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <Link href="/lab" className="truncate font-medium text-neutral-800 hover:underline dark:text-neutral-100">{b.name}</Link>
                                <span className="shrink-0 rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600 dark:text-violet-300">회원 봇</span>
                              </div>
                              <div className="mt-0.5 text-[10px] text-neutral-400 dark:text-neutral-500">{b.owner} 의 봇 · 승부 픽만</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-neutral-600 dark:text-neutral-300">{b.hit}/{b.total}</td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-neutral-900 dark:text-white">{Math.round((b.hit / b.total) * 100)}%</td>
                      </tr>
                    );
                  }
                  const u = userById.get(b.userId);
                  const g = u ? displayGrade(u.level, u.badge) : null;
                  const avatar = u ? resolveAvatar(u.avatarUrl, u.nickname, u.level, u.badge) : null;
                  const mk = (marketByUser.get(b.userId) ?? []).filter((r) => r.total > 0);
                  return (
                  <tr key={b.key} className={`border-b border-neutral-100 last:border-0 dark:border-neutral-800/60 ${b.userId === userId ? "bg-rose-500/5" : ""}`}>
                    <td className={`px-3 py-2.5 font-bold tabular-nums ${rankCls}`}>{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        {avatar && <Avatar avatar={avatar} size="sm" frame={u?.avatarFrame} />}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium text-neutral-800 dark:text-neutral-100">{u?.nickname ?? "회원"}</span>
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
