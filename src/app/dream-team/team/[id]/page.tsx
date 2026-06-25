// 드림팀 공유 페이지 — 다른 회원 팀 스쿼드·전적 구경 + 도전 (공개)
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUserId } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getDreamPlayers } from "@/lib/dream-team/pool";
import { teamAvgOvr } from "@/lib/dream-team/ovr-to-elo";
import { grownOvr } from "@/lib/dream-team/grow";
import { TIERS } from "@/lib/dream-team/tiers";
import { ROLES } from "@/lib/dream-team/tactics";
import AmbientGlow from "@/components/AmbientGlow";
import ChallengeButton from "./ChallengeButton";
import ShareButton from "../../ShareButton";
import { resolveAvatar } from "@/lib/analysis/analysts";
import Avatar from "@/components/experts/Avatar";

interface SquadPlayer {
  slot: string;
  playerId: string;
  xp?: number;
  role?: string;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const team = await prisma.dreamTeam.findUnique({
    where: { id },
    include: { user: { select: { nickname: true } } },
  });
  if (!team) return { title: "드림팀 | Scorebase" };
  const tierName = TIERS[team.tier]?.name ?? team.tier;
  const site = process.env.SITE_URL ?? "https://www.scorebase.kr";
  const title = `${team.name} · ${tierName} 드림팀`;
  const description = `감독 ${team.user.nickname} · ${team.formation} · 레이팅 ${team.rating} · ${team.wins}승 ${team.draws}무 ${team.losses}패. 빅5 현역 선수로 짠 가성비 드림팀에 도전해보세요.`;
  const ogImage = `${site}/api/og/dream-team?teamId=${team.id}`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${site}/dream-team/team/${team.id}`,
      images: [{ url: ogImage, width: 1080, height: 1350 }],
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  };
}

const POS_LABEL: Record<string, string> = { GK: "골키퍼", DF: "수비수", MF: "미드필더", FW: "공격수" };
const POS_ORDER = ["FW", "MF", "DF", "GK"];

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const team = await prisma.dreamTeam.findUnique({ where: { id }, include: { user: { select: { nickname: true, avatarUrl: true, level: true, badge: true } } } });
  if (!team) notFound();

  const userId = await getCurrentUserId();
  const isMine = team.userId === userId;
  const players = (team.players as unknown as SquadPlayer[]) ?? [];
  const pool = getDreamPlayers(players.map((p) => p.playerId));
  const xpById = new Map(players.map((p) => [p.playerId, p.xp ?? 0]));
  const roleById = new Map(players.map((p) => [p.playerId, p.role ?? "balanced"]));

  const squad = pool.map((dp) => ({ ...dp, cur: grownOvr(dp.ovr, dp.potential, xpById.get(dp.id) ?? 0), role: roleById.get(dp.id) ?? "balanced" }));
  const teamOvr = squad.length ? Math.round(teamAvgOvr(squad.map((s) => s.cur))) : 0;
  const byPos: Record<string, typeof squad> = { GK: [], DF: [], MF: [], FW: [] };
  squad.forEach((s) => byPos[s.pos]?.push(s));

  const tierName = TIERS[team.tier]?.name ?? team.tier;
  const siteUrl = process.env.SITE_URL ?? "https://www.scorebase.kr";
  const shareText = isMine
    ? `내 드림팀 "${team.name}" (${tierName}·OVR ${teamOvr}) 이겨봐`
    : `"${team.name}" 드림팀 (${tierName}·OVR ${teamOvr})`;

  return (
    <main className="relative mx-auto max-w-2xl px-4 py-10">
      <AmbientGlow />
      <div className="relative">
        <span className="inline-block rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-300 dark:ring-rose-500/30">
          {TIERS[team.tier]?.name ?? team.tier} 리그
        </span>
        <h1 className="mt-3 text-2xl font-semibold text-neutral-900 dark:text-white">{team.name}</h1>
        <div className="mt-2 flex items-center gap-2">
          <Avatar avatar={resolveAvatar(team.user.avatarUrl, team.user.nickname, team.user.level, team.user.badge)} size="sm" />
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            감독 {team.user.nickname} · {team.formation} · 팀 OVR {teamOvr}
          </p>
        </div>
        <div className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          레이팅 {team.rating} · {team.wins}승 {team.draws}무 {team.losses}패
        </div>

        <div className="mt-4">
          <ShareButton
            url={`${siteUrl}/dream-team/team/${team.id}`}
            title={`${team.name} · ${tierName} 드림팀`}
            text={shareText}
            mine={isMine}
          />
        </div>

        {squad.length === 11 ? (
          <div className="mt-6 space-y-4">
            {POS_ORDER.map(
              (pos) =>
                byPos[pos].length > 0 && (
                  <div key={pos}>
                    <div className="mb-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">{POS_LABEL[pos]}</div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {byPos[pos].map((s) => (
                        <div key={s.id} className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-2 dark:border-neutral-800 dark:bg-white/[0.04]">
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                            {s.photo ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={s.photo} alt={s.name} className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-[11px] text-neutral-500">{s.name.slice(0, 2)}</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1">
                              <span className="truncate text-xs font-medium text-neutral-900 dark:text-white">{s.name}</span>
                              {s.pos !== "GK" && s.role !== "balanced" && (
                                <span className={`flex-shrink-0 rounded px-1 text-[10px] font-medium ${s.role === "attack" ? "bg-rose-500/15 text-rose-600 dark:text-rose-400" : "bg-sky-500/15 text-sky-600 dark:text-sky-400"}`}>
                                  {ROLES[s.role]?.short}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                              OVR {s.cur}
                              {s.cur > s.ovr ? ` (+${s.cur - s.ovr})` : ""}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ),
            )}
          </div>
        ) : (
          <p className="mt-6 text-sm text-neutral-500 dark:text-neutral-400">아직 구성 중인 팀입니다.</p>
        )}

        {!isMine && userId && squad.length === 11 && (
          <div className="mt-6">
            <ChallengeButton opponentId={team.id} />
          </div>
        )}
        {isMine && <p className="mt-6 text-sm text-neutral-400">내 팀입니다.</p>}
        {!userId && (
          <p className="mt-6 text-sm text-neutral-500 dark:text-neutral-400">
            <a href={`/login?from=/dream-team/team/${team.id}`} className="font-medium text-rose-600 underline dark:text-rose-400">로그인</a>하고 이 팀에 도전하세요.
          </p>
        )}

        <a href="/dream-team/leaderboard" className="mt-6 inline-block text-sm text-neutral-500 hover:text-rose-600 dark:text-neutral-400">← 리더보드</a>
      </div>
    </main>
  );
}
