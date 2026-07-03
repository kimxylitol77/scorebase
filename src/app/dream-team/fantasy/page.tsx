// 드림팀 월드컵 판타지 — 선발 11명의 실경기(월드컵) 포인트 랭킹 + 폼 보너스 선수 (공개)
import type { Metadata } from "next";
import { getCurrentUserId } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { TIERS } from "@/lib/dream-team/tiers";
import { getDreamPlayers } from "@/lib/dream-team/pool";
import { lineupMembers, type SquadMember, type LineupSlot } from "@/lib/dream-team/squad";
import { getWcFantasyMap, getWcFormMap, lineupFantasyPoints, wcEventActive, WC_EVENT_END_MS } from "@/lib/dream-team/wc-event";
import AmbientGlow from "@/components/AmbientGlow";
import DreamTeamNav from "../DreamTeamNav";
import { resolveAvatar } from "@/lib/analysis/analysts";
import Avatar from "@/components/experts/Avatar";

export const metadata: Metadata = {
  title: "드림팀 월드컵 판타지 | Scorebase",
  description: "내 드림팀 선발 11명의 월드컵 실경기 활약이 판타지 포인트가 됩니다. 팀 랭킹과 폼 보너스 선수.",
};

const RULES: { label: string; pts: string }[] = [
  { label: "출전", pts: "+1" },
  { label: "60분 이상", pts: "+1" },
  { label: "골", pts: "+4" },
  { label: "도움", pts: "+3" },
  { label: "평점 7.5+ / 8.0+", pts: "+1 / +2" },
  { label: "경고 / 퇴장", pts: "−1 / −3" },
  { label: "GK 세이브 3개당", pts: "+1" },
];

export default async function FantasyPage() {
  const userId = await getCurrentUserId();
  const [fantasy, wcForm, teams] = await Promise.all([
    getWcFantasyMap(),
    getWcFormMap(),
    prisma.dreamTeam.findMany({
      include: { user: { select: { nickname: true, avatarUrl: true, level: true, badge: true } } },
      take: 100,
    }),
  ]);
  const active = wcEventActive();
  const endDate = new Date(WC_EVENT_END_MS - 1);
  const endLabel = `${endDate.getUTCMonth() + 1}월 ${endDate.getUTCDate()}일`;

  // 팀별 선발 11명 판타지 합산 → 랭킹
  const ranked = teams
    .map((t) => {
      const lineup = (t.lineup as unknown as LineupSlot[]) ?? [];
      const squad = (t.squad as unknown as SquadMember[]) ?? [];
      const ids = lineupMembers(squad, lineup).map((m) => m.playerId);
      const wcPlayers = ids.filter((id) => fantasy[id]).length;
      return { t, points: lineupFantasyPoints(fantasy, ids), wcPlayers };
    })
    .sort((a, b) => b.points - a.points || b.t.rating - a.t.rating);
  const myEntry = userId ? ranked.find((r) => r.t.userId === userId) : undefined;

  // 내 선발 11명 상세 (월드컵 출전 선수만 포인트, 나머지는 0)
  let myRows: { name: string; pos: string; points: number; goals: number; assists: number; games: number }[] = [];
  if (myEntry) {
    const lineup = (myEntry.t.lineup as unknown as LineupSlot[]) ?? [];
    const squad = (myEntry.t.squad as unknown as SquadMember[]) ?? [];
    const ids = lineupMembers(squad, lineup).map((m) => m.playerId);
    myRows = getDreamPlayers(ids)
      .map((p) => {
        const f = fantasy[p.id];
        return { name: p.name, pos: p.pos, points: f?.points ?? 0, goals: f?.goals ?? 0, assists: f?.assists ?? 0, games: f?.games ?? 0 };
      })
      .sort((a, b) => b.points - a.points);
  }

  // 폼 보너스 TOP — 영입 유도 겸 이벤트 체감 (풀 선수만 들어있음)
  const formIds = Object.keys(wcForm);
  const formPlayers = getDreamPlayers(formIds)
    .map((p) => ({ p, f: wcForm[p.id] }))
    .sort((a, b) => b.f.bonus - a.f.bonus || b.f.avgRating - a.f.avgRating)
    .slice(0, 12);

  return (
    <main className="relative mx-auto max-w-5xl px-4 py-10">
      <AmbientGlow />
      <div className="relative">
        <DreamTeamNav />
        <span className="inline-block rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-300 dark:ring-rose-500/30">
          월드컵 판타지
        </span>
        <h1 className="mt-3 text-2xl font-semibold text-neutral-900 dark:text-white">
          내 선발 11명, 실제 월드컵에서 몇 점일까
        </h1>
        <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
          드림팀 선발 라인업 선수들이 실제 월드컵 경기에서 올린 기록(골·도움·평점)이 그대로 판타지 포인트가 됩니다.
          {active ? (
            <span className="ml-1">
              결승까지({endLabel}) 집계되고, 월드컵 활약 선수는 게임 경기 전력에 폼 보너스를 받습니다.
            </span>
          ) : (
            <span className="ml-1 font-medium text-neutral-600 dark:text-neutral-300">이벤트가 종료되어 최종 순위를 보여드립니다.</span>
          )}
        </p>

        {/* 채점 규칙 */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {RULES.map((r) => (
            <span key={r.label} className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-600 dark:border-neutral-800 dark:bg-white/[0.04] dark:text-neutral-300">
              {r.label} <span className="font-semibold text-rose-600 dark:text-rose-400">{r.pts}</span>
            </span>
          ))}
        </div>

        {/* 내 팀 상세 */}
        {myEntry && myRows.length > 0 && (
          <section className="mt-7">
            <h2 className="text-sm font-bold text-neutral-900 dark:text-white">
              내 선발 11명 — 합계 <span className="text-rose-600 dark:text-rose-400">{myEntry.points}점</span>
              <span className="ml-1.5 text-xs font-normal text-neutral-500 dark:text-neutral-400">(월드컵 출전 {myEntry.wcPlayers}명)</span>
            </h2>
            <div className="mt-2 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500 dark:border-neutral-800 dark:bg-white/[0.04] dark:text-neutral-400">
                    <th className="px-3 py-2 font-medium">선수</th>
                    <th className="px-3 py-2 font-medium">포지션</th>
                    <th className="px-3 py-2 text-right font-medium">출전</th>
                    <th className="px-3 py-2 text-right font-medium">골·도움</th>
                    <th className="px-3 py-2 text-right font-medium">포인트</th>
                  </tr>
                </thead>
                <tbody>
                  {myRows.map((r) => (
                    <tr key={r.name + r.pos} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60">
                      <td className="px-3 py-2 font-medium text-neutral-900 dark:text-white">{r.name}</td>
                      <td className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400">{r.pos}</td>
                      <td className="px-3 py-2 text-right text-neutral-600 dark:text-neutral-300">{r.games > 0 ? `${r.games}경기` : "—"}</td>
                      <td className="px-3 py-2 text-right text-neutral-600 dark:text-neutral-300">{r.games > 0 ? `${r.goals}·${r.assists}` : "—"}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${r.points > 0 ? "text-rose-600 dark:text-rose-400" : "text-neutral-400"}`}>{r.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-400">월드컵에 나가지 않은 선수는 0점 — 월드컵 스타를 영입할수록 유리합니다.</p>
          </section>
        )}

        {/* 팀 랭킹 */}
        <section className="mt-7">
          <h2 className="text-sm font-bold text-neutral-900 dark:text-white">판타지 팀 랭킹</h2>
          {ranked.length === 0 ? (
            <p className="mt-2 rounded-xl border border-neutral-200 bg-white px-4 py-10 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:bg-white/[0.04]">
              아직 등록된 팀이 없습니다. 빌더에서 팀을 만들면 자동 참가됩니다.
            </p>
          ) : (
            <div className="mt-2 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500 dark:border-neutral-800 dark:bg-white/[0.04] dark:text-neutral-400">
                    <th className="px-3 py-2 font-medium">순위</th>
                    <th className="px-3 py-2 font-medium">팀 · 감독</th>
                    <th className="px-3 py-2 font-medium">티어</th>
                    <th className="px-3 py-2 text-right font-medium">WC 출전</th>
                    <th className="px-3 py-2 text-right font-medium">포인트</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map(({ t, points, wcPlayers }, i) => {
                    const mine = t.userId === userId;
                    return (
                      <tr key={t.id} className={`border-b border-neutral-100 last:border-0 dark:border-neutral-800/60 ${mine ? "bg-rose-500/5" : ""}`}>
                        <td className="px-3 py-2.5 font-medium text-neutral-900 dark:text-white">{i + 1}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <Avatar avatar={resolveAvatar(t.user.avatarUrl, t.user.nickname, t.user.level, t.user.badge)} size="sm" />
                            <div className="min-w-0">
                              <a href={`/dream-team/team/${t.id}`} className="block truncate font-medium text-neutral-900 hover:text-rose-600 dark:text-white dark:hover:text-rose-400">{t.name}</a>
                              <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">{t.user.nickname}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-neutral-600 dark:text-neutral-300">{TIERS[t.tier]?.name ?? t.tier}</td>
                        <td className="px-3 py-2.5 text-right text-xs text-neutral-500 dark:text-neutral-400">{wcPlayers}명</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-neutral-900 dark:text-white">{points}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 폼 보너스 선수 */}
        {active && formPlayers.length > 0 && (
          <section className="mt-7">
            <h2 className="text-sm font-bold text-neutral-900 dark:text-white">지금 폼 보너스 받는 선수</h2>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              월드컵 활약(골·도움·평점)에 따라 게임 경기 전력에 OVR 보너스가 붙습니다. 이적 시장에서 영입해 체감해 보세요.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {formPlayers.map(({ p, f }) => (
                <div key={p.id} className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 dark:border-neutral-800 dark:bg-white/[0.04]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-neutral-900 dark:text-white">{p.name}</span>
                    <span className="shrink-0 rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-bold text-rose-600 dark:text-rose-400">+{f.bonus}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                    {p.team} · {f.goals}골 {f.assists}도움 · 평점 {f.avgRating.toFixed(1)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
