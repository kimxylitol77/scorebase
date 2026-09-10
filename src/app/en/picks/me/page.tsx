// /en/picks/me — 내 예측 리포트(영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { toEnglishTeamName } from "@/lib/i18n/en";

export const metadata: Metadata = {
  title: "My prediction report · Scorebase",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const LEAGUE_KO: Record<string, string> = {
  WORLD_CUP: "World Cup", KBO: "KBO", MLB: "MLB", NPB: "NPB", EPL: "EPL", LALIGA: "LaLiga",
  BUNDESLIGA: "Bundesliga", SERIE_A: "Serie A", LIGUE_1: "Ligue 1", MLS: "MLS", UCL: "UCL", UEL: "UEL", UECL: "UECL",
  CLUB_WORLD_CUP: "Club World Cup", K_LEAGUE_1: "K League 1", NBA: "NBA", NHL: "NHL",
};

const PICK_KO: Record<string, string> = { home: "Home win", draw: "Draw", away: "Away win" };
import { MARKET_LABEL_EN as MARKET_LABEL, pickLabel, type VoteMarket } from "@/lib/vote-markets";

function pct(hit: number, total: number): number {
  return Math.round((hit / total) * 100);
}

function kstDate(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()}`;
}

function kstMonthKey(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}.${String(k.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function MyPicksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?from=/en/picks/me");

  const votes = await prisma.matchVote.findMany({
    where: { userId: user.id },
    select: { matchId: true, market: true, line: true, pick: true, correct: true, pickOdds: true, closeOdds: true, clv: true },
  });
  const total = votes.length;
  const scoredVotes = votes.filter((v) => v.correct !== null);
  const pending = total - scoredVotes.length;

  // 채점된 투표의 매치 정보 (MatchVote 는 Match 관계가 없어 2단계 조회)
  const matches = scoredVotes.length
    ? await prisma.match.findMany({
        where: { id: { in: scoredVotes.map((v) => v.matchId) } },
        select: {
          id: true, league: true, startTime: true, homeScore: true, awayScore: true, predCorrect: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      })
    : [];
  const matchById = new Map(matches.map((m) => [m.id, m]));

  // 매치 시간순(최신 먼저) 정렬된 채점 기록
  const scored = scoredVotes
    .map((v) => ({ ...v, match: matchById.get(v.matchId) }))
    .filter((v) => v.match)
    .sort((a, b) => b.match!.startTime.getTime() - a.match!.startTime.getTime());

  const hit = scored.filter((v) => v.correct).length;
  // 수익 시뮬(플랫 1유닛, 픽 시점 배당) + 평균 CLV — 둘 다 참고용, 배당 없는 표는 제외
  const priced = scored.filter((v) => v.pickOdds != null && v.pickOdds > 1);
  const units = priced.reduce((a, v) => a + (v.correct ? v.pickOdds! - 1 : -1), 0);
  const roi = priced.length > 0 ? units / priced.length : null;
  const clvRows = votes.filter((v) => v.clv != null);
  const avgClv = clvRows.length > 0 ? (clvRows.reduce((a, v) => a + v.clv!, 0) / clvRows.length) * 100 : null;
  const recent10 = scored.slice(0, 10);
  const recent10Hit = recent10.filter((v) => v.correct).length;
  let streak = 0;
  for (const v of scored) {
    if (!v.correct) break;
    streak++;
  }

  // 나 vs AI — 같은 경기에서 AI(predCorrect)가 채점된 것만 비교
  const vsAi = scored.filter((v) => v.match!.predCorrect !== null);
  const vsAiMyHit = vsAi.filter((v) => v.correct).length;
  const vsAiAiHit = vsAi.filter((v) => v.match!.predCorrect).length;

  // 리그별 분해 (투표수순)
  const byLeague = new Map<string, { total: number; hit: number }>();
  for (const v of scored) {
    const lg = v.match!.league ?? "Other";
    const cur = byLeague.get(lg) ?? { total: 0, hit: 0 };
    cur.total++;
    if (v.correct) cur.hit++;
    byLeague.set(lg, cur);
  }
  const leagueRows = [...byLeague.entries()].sort((a, b) => b[1].total - a[1].total);

  // 월별 추이 (KST, 최근 6개월)
  const byMonth = new Map<string, { total: number; hit: number }>();
  for (const v of scored) {
    const key = kstMonthKey(v.match!.startTime);
    const cur = byMonth.get(key) ?? { total: 0, hit: 0 };
    cur.total++;
    if (v.correct) cur.hit++;
    byMonth.set(key, cur);
  }
  const monthRows = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-6);

  // 회원 랭킹 내 순위 (채점 3표 이상, /picks 랭킹과 동일 기준)
  let myRank: { rank: number; of: number } | null = null;
  if (scored.length >= 3) {
    const board = await prisma.$queryRaw<{ userId: string }[]>`
      SELECT "userId"
      FROM "MatchVote"
      WHERE "userId" IS NOT NULL AND correct IS NOT NULL
      GROUP BY "userId"
      HAVING COUNT(*) >= 3
      ORDER BY SUM(CASE WHEN correct THEN 1 ELSE 0 END)::float / COUNT(*) DESC, COUNT(*) DESC`;
    const idx = board.findIndex((b) => b.userId === user.id);
    if (idx >= 0) myRank = { rank: idx + 1, of: board.length };
  }

  const card = "rounded-2xl border border-neutral-200/80 bg-white p-4 dark:border-white/10 dark:bg-white/[0.04]";

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <span className="inline-block rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-300 dark:ring-rose-500/30">
        My prediction report
      </span>
      <h1 className="mt-3 text-2xl font-semibold text-neutral-900 dark:text-white">{user.nickname} ’s prediction accuracy</h1>
      <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
        Your prediction record, scored automatically after each match.
        {pending > 0 && <span className="ml-1">pending {pending} votes will be scored after the matches end.</span>}
      </p>

      {scored.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-neutral-200 bg-white px-4 py-12 text-center dark:border-neutral-800 dark:bg-white/[0.04]">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {total === 0 ? "No predictions yet. Try your first match." : "No scored predictions yet. They are scored automatically after matches end."}
          </p>
          <Link
            href="/picks"
            className="mt-4 inline-block rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500"
          >
            Go predict
          </Link>
        </div>
      ) : (
        <>
          {/* 요약 */}
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <div className={card}>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">accuracy</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-white">{pct(hit, scored.length)}%</div>
              <div className="mt-0.5 text-xs text-neutral-500">
                hits <span className="font-semibold text-rose-600 dark:text-rose-400">{hit}</span>/{scored.length}
              </div>
            </div>
            <div className={card}>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">Last 10</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-white">
                {recent10Hit}<span className="text-base font-medium text-neutral-400">/{recent10.length}</span>
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {streak >= 2 ? `Streak ${streak} in a row` : "Recent form"}
              </div>
            </div>
            <div className={card}>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">Total votes</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-white">{total}</div>
              <div className="mt-0.5 text-xs text-neutral-500">pending {pending}</div>
            </div>
            <div className={card} title="Backtest assuming 1 unit per match at the average overseas odds when you picked. For reference only — no returns are guaranteed.">
              <div className="text-xs text-neutral-500 dark:text-neutral-400">P/L sim (1u)</div>
              <div className={`mt-1 text-2xl font-bold tabular-nums ${roi == null ? "text-neutral-400" : units >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {roi == null ? "—" : `${units >= 0 ? "+" : ""}${units.toFixed(1)}u`}
              </div>
              <div className="mt-0.5 text-xs text-neutral-500 tabular-nums">
                {roi == null ? "no votes with odds" : `ROI ${roi >= 0 ? "+" : ""}${(roi * 100).toFixed(1)}% · ${priced.length} votes`}
              </div>
            </div>
            <div className={card} title="CLV (Closing Line Value) — how much better the odds at pick time were than the closing line. Consistently positive means you moved before the market.">
              <div className="text-xs text-neutral-500 dark:text-neutral-400">Avg CLV</div>
              <div className={`mt-1 text-2xl font-bold tabular-nums ${avgClv == null ? "text-neutral-400" : avgClv >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {avgClv == null ? "—" : `${avgClv >= 0 ? "+" : ""}${avgClv.toFixed(1)}%`}
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">{avgClv == null ? "awaiting closing line" : `${clvRows.length} votes · vs closing`}</div>
            </div>
            <div className={card}>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">Member ranking</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-white">
                {myRank ? `${myRank.rank}th` : "—"}
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {myRank ? `Ranker ${myRank.of} of` : "ranked from 3 scored votes"}
              </div>
            </div>
          </div>

          {/* 나 vs AI */}
          {vsAi.length > 0 && (
            <section className="mt-7">
              <h2 className="text-sm font-bold text-neutral-900 dark:text-white">Me vs AI · same matches {vsAi.length}</h2>
              <div className={`mt-2 ${card}`}>
                {[
                  { label: "Me", hitCount: vsAiMyHit, accent: "bg-rose-500" },
                  { label: "AI", hitCount: vsAiAiHit, accent: "bg-neutral-400 dark:bg-neutral-500" },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-3 py-1.5">
                    <span className="w-8 shrink-0 text-sm font-semibold text-neutral-900 dark:text-white">{row.label}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/10">
                      <div className={`h-full rounded-full ${row.accent}`} style={{ width: `${pct(row.hitCount, vsAi.length)}%` }} />
                    </div>
                    <span className="w-24 shrink-0 text-right text-sm tabular-nums text-neutral-600 dark:text-neutral-300">
                      {row.hitCount}/{vsAi.length} · <span className="font-semibold text-neutral-900 dark:text-white">{pct(row.hitCount, vsAi.length)}%</span>
                    </span>
                  </div>
                ))}
                <p className="mt-2 text-xs font-medium">
                  {vsAiMyHit > vsAiAiHit ? (
                    <span className="text-emerald-600 dark:text-emerald-400">Beating the AI.</span>
                  ) : vsAiMyHit === vsAiAiHit ? (
                    <span className="text-neutral-500">Level with the AI.</span>
                  ) : (
                    <span className="text-neutral-500">AI {vsAiAiHit - vsAiMyHit} ahead.</span>
                  )}
                </p>
              </div>
            </section>
          )}

          {/* 리그별 */}
          <section className="mt-7">
            <h2 className="text-sm font-bold text-neutral-900 dark:text-white">Accuracy by league</h2>
            <div className="mt-2 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500 dark:border-neutral-800 dark:bg-white/[0.04] dark:text-neutral-400">
                    <th className="px-3 py-2 font-medium">League</th>
                    <th className="px-3 py-2 text-right font-medium">hits</th>
                    <th className="w-1/2 px-3 py-2 font-medium">accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {leagueRows.map(([lg, r]) => (
                    <tr key={lg} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60">
                      <td className="px-3 py-2.5 font-medium text-neutral-900 dark:text-white">{LEAGUE_KO[lg] ?? lg}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-neutral-600 dark:text-neutral-300">{r.hit}/{r.total}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/10">
                            <div className="h-full rounded-full bg-rose-500" style={{ width: `${pct(r.hit, r.total)}%` }} />
                          </div>
                          <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-neutral-900 dark:text-white">
                            {pct(r.hit, r.total)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 월별 추이 */}
          {monthRows.length > 1 && (
            <section className="mt-7">
              <h2 className="text-sm font-bold text-neutral-900 dark:text-white">Monthly trend</h2>
              <div className={`mt-2 ${card}`}>
                {monthRows.map(([key, r]) => (
                  <div key={key} className="flex items-center gap-3 py-1.5">
                    <span className="w-16 shrink-0 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">{key}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/10">
                      <div className="h-full rounded-full bg-rose-500" style={{ width: `${pct(r.hit, r.total)}%` }} />
                    </div>
                    <span className="w-20 shrink-0 text-right text-xs tabular-nums text-neutral-600 dark:text-neutral-300">
                      {r.hit}/{r.total} · <span className="font-semibold text-neutral-900 dark:text-white">{pct(r.hit, r.total)}%</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 최근 기록 */}
          <section className="mt-7">
            <h2 className="text-sm font-bold text-neutral-900 dark:text-white">Recent · {Math.min(scored.length, 15)}</h2>
            <div className="mt-2 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500 dark:border-neutral-800 dark:bg-white/[0.04] dark:text-neutral-400">
                    <th className="px-3 py-2 font-medium">Match</th>
                    <th className="px-3 py-2 font-medium">My pick</th>
                    <th className="px-3 py-2 text-center font-medium">Result</th>
                    <th className="px-3 py-2 text-right font-medium" title="Pick odds · CLV vs closing">Odds · CLV</th>
                    <th className="px-3 py-2 text-center font-medium">AI</th>
                  </tr>
                </thead>
                <tbody>
                  {scored.slice(0, 15).map((v) => {
                    const m = v.match!;
                    const lg = m.league ?? "";
                    const home = toEnglishTeamName(m.homeTeam.name);
                    const away = toEnglishTeamName(m.awayTeam.name);
                    return (
                      <tr key={`${v.matchId}-${v.market}`} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60">
                        <td className="px-3 py-2.5">
                          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                            {kstDate(m.startTime)} · {LEAGUE_KO[lg] ?? lg}
                          </div>
                          <div className="font-medium text-neutral-900 dark:text-white">
                            {home} <span className="tabular-nums text-neutral-500">{m.homeScore}:{m.awayScore}</span> {away}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-neutral-600 dark:text-neutral-300">
                          {v.market === "1X2"
                            ? (PICK_KO[v.pick] ?? v.pick)
                            : pickLabel(v.market as VoteMarket, v.pick, home, away, v.line, "en")}
                          {v.market !== "1X2" && (
                            <span className="ml-1 rounded bg-neutral-100 px-1 py-0.5 text-[10px] text-neutral-500 dark:bg-white/[0.08] dark:text-neutral-400">{MARKET_LABEL[v.market as VoteMarket] ?? v.market}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {v.correct ? (
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">hits</span>
                          ) : (
                            <span className="rounded-full bg-neutral-500/10 px-2 py-0.5 text-xs font-medium text-neutral-500">miss</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs tabular-nums">
                          {v.pickOdds == null ? (
                            <span className="text-neutral-400">—</span>
                          ) : (
                            <>
                              <span className="text-neutral-700 dark:text-neutral-200">{v.pickOdds.toFixed(2)}</span>
                              {v.clv != null && (
                                <span className={`ml-1 ${v.clv >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                                  {v.clv >= 0 ? "+" : ""}{(v.clv * 100).toFixed(1)}%
                                </span>
                              )}
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center text-xs font-medium">
                          {m.predCorrect === null ? (
                            <span className="text-neutral-400">—</span>
                          ) : m.predCorrect ? (
                            <span className="text-emerald-600 dark:text-emerald-400">hits</span>
                          ) : (
                            <span className="text-neutral-500">miss</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <div className="mt-8">
        <Link href="/picks" className="text-sm font-medium text-rose-600 hover:underline dark:text-rose-400">
          ← Back to predictions
        </Link>
      </div>
    </main>
  );
}
