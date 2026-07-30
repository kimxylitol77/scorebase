// /picks/me — 회원 전용 내 예측 리포트: 요약·나 vs AI·리그별·월별·최근 기록 (MatchVote 집계)
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { toKoreanTeamName } from "@/lib/team-names";

export const metadata: Metadata = {
  title: "내 예측 리포트 · 스코어베이스",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const LEAGUE_KO: Record<string, string> = {
  WORLD_CUP: "월드컵", KBO: "KBO", MLB: "MLB", NPB: "NPB", EPL: "EPL", LALIGA: "라리가",
  BUNDESLIGA: "분데스리가", SERIE_A: "세리에 A", LIGUE_1: "리그 1", MLS: "MLS", UCL: "UCL", UEL: "UEL",
  CLUB_WORLD_CUP: "클럽 월드컵", K_LEAGUE_1: "K리그1", NBA: "NBA", NHL: "NHL",
};

const PICK_KO: Record<string, string> = { home: "홈 승", draw: "무승부", away: "원정 승" };

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
  if (!user) redirect("/login?from=/picks/me");

  const votes = await prisma.matchVote.findMany({
    where: { userId: user.id },
    select: { matchId: true, pick: true, correct: true },
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
    const lg = v.match!.league ?? "기타";
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
        내 예측 리포트
      </span>
      <h1 className="mt-3 text-2xl font-semibold text-neutral-900 dark:text-white">{user.nickname} 님의 예측 정확도</h1>
      <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
        경기 종료 후 자동 채점된 승부예측 기록입니다.
        {pending > 0 && <span className="ml-1">채점 대기 {pending}표는 경기가 끝나면 반영됩니다.</span>}
      </p>

      {scored.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-neutral-200 bg-white px-4 py-12 text-center dark:border-neutral-800 dark:bg-white/[0.04]">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {total === 0 ? "아직 예측 기록이 없습니다. 첫 경기를 예측해 보세요." : "아직 채점된 예측이 없습니다. 경기가 끝나면 자동 채점됩니다."}
          </p>
          <Link
            href="/picks"
            className="mt-4 inline-block rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500"
          >
            예측하러 가기
          </Link>
        </div>
      ) : (
        <>
          {/* 요약 */}
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className={card}>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">적중률</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-white">{pct(hit, scored.length)}%</div>
              <div className="mt-0.5 text-xs text-neutral-500">
                적중 <span className="font-semibold text-rose-600 dark:text-rose-400">{hit}</span>/{scored.length}
              </div>
            </div>
            <div className={card}>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">최근 10경기</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-white">
                {recent10Hit}<span className="text-base font-medium text-neutral-400">/{recent10.length}</span>
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {streak >= 2 ? `연속 ${streak}경기 적중 중` : "최근 폼"}
              </div>
            </div>
            <div className={card}>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">총 투표</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-white">{total}</div>
              <div className="mt-0.5 text-xs text-neutral-500">채점 대기 {pending}</div>
            </div>
            <div className={card}>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">회원 랭킹</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-white">
                {myRank ? `${myRank.rank}위` : "—"}
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {myRank ? `랭커 ${myRank.of}명 중` : "채점 3표부터 집계"}
              </div>
            </div>
          </div>

          {/* 나 vs AI */}
          {vsAi.length > 0 && (
            <section className="mt-7">
              <h2 className="text-sm font-bold text-neutral-900 dark:text-white">나 vs AI · 같은 경기 {vsAi.length}</h2>
              <div className={`mt-2 ${card}`}>
                {[
                  { label: "나", hitCount: vsAiMyHit, accent: "bg-rose-500" },
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
                    <span className="text-emerald-600 dark:text-emerald-400">AI 를 이기고 있습니다.</span>
                  ) : vsAiMyHit === vsAiAiHit ? (
                    <span className="text-neutral-500">AI 와 동률입니다.</span>
                  ) : (
                    <span className="text-neutral-500">AI 가 {vsAiAiHit - vsAiMyHit}경기 앞서 있습니다.</span>
                  )}
                </p>
              </div>
            </section>
          )}

          {/* 리그별 */}
          <section className="mt-7">
            <h2 className="text-sm font-bold text-neutral-900 dark:text-white">리그별 적중률</h2>
            <div className="mt-2 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500 dark:border-neutral-800 dark:bg-white/[0.04] dark:text-neutral-400">
                    <th className="px-3 py-2 font-medium">리그</th>
                    <th className="px-3 py-2 text-right font-medium">적중</th>
                    <th className="w-1/2 px-3 py-2 font-medium">적중률</th>
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
              <h2 className="text-sm font-bold text-neutral-900 dark:text-white">월별 추이</h2>
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
            <h2 className="text-sm font-bold text-neutral-900 dark:text-white">최근 기록 · {Math.min(scored.length, 15)}</h2>
            <div className="mt-2 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500 dark:border-neutral-800 dark:bg-white/[0.04] dark:text-neutral-400">
                    <th className="px-3 py-2 font-medium">경기</th>
                    <th className="px-3 py-2 font-medium">내 픽</th>
                    <th className="px-3 py-2 text-center font-medium">결과</th>
                    <th className="px-3 py-2 text-center font-medium">AI</th>
                  </tr>
                </thead>
                <tbody>
                  {scored.slice(0, 15).map((v) => {
                    const m = v.match!;
                    const lg = m.league ?? "";
                    const home = toKoreanTeamName(m.homeTeam.name, lg) || m.homeTeam.name;
                    const away = toKoreanTeamName(m.awayTeam.name, lg) || m.awayTeam.name;
                    return (
                      <tr key={v.matchId} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60">
                        <td className="px-3 py-2.5">
                          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                            {kstDate(m.startTime)} · {LEAGUE_KO[lg] ?? lg}
                          </div>
                          <div className="font-medium text-neutral-900 dark:text-white">
                            {home} <span className="tabular-nums text-neutral-500">{m.homeScore}:{m.awayScore}</span> {away}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-neutral-600 dark:text-neutral-300">{PICK_KO[v.pick] ?? v.pick}</td>
                        <td className="px-3 py-2.5 text-center">
                          {v.correct ? (
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">적중</span>
                          ) : (
                            <span className="rounded-full bg-neutral-500/10 px-2 py-0.5 text-xs font-medium text-neutral-500">미적중</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center text-xs font-medium">
                          {m.predCorrect === null ? (
                            <span className="text-neutral-400">—</span>
                          ) : m.predCorrect ? (
                            <span className="text-emerald-600 dark:text-emerald-400">적중</span>
                          ) : (
                            <span className="text-neutral-500">미적중</span>
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
          ← 승부예측으로 돌아가기
        </Link>
      </div>
    </main>
  );
}
