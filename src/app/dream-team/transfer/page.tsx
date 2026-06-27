// 드림팀 이적 시장 페이지 — 자금으로 선수 영입/방출
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { allDreamPlayers } from "@/lib/dream-team/pool";
import type { SquadMember } from "@/lib/dream-team/squad";
import AmbientGlow from "@/components/AmbientGlow";
import TransferClient from "./TransferClient";
import DreamTeamNav from "../DreamTeamNav";

export const metadata: Metadata = { title: "드림팀 이적 시장 | Scorebase" };

export default async function TransferPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login?from=/dream-team/transfer");
  const team = await prisma.dreamTeam.findFirst({ where: { userId } });
  if (!team) redirect("/dream-team");
  const squad = (team.squad as unknown as SquadMember[]) ?? [];
  const pool = allDreamPlayers();

  return (
    <main className="relative mx-auto max-w-5xl px-4 py-10">
      <AmbientGlow />
      <div className="relative">
        <DreamTeamNav />
        <span className="inline-block rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-300 dark:ring-rose-500/30">
          이적 시장
        </span>
        <h1 className="mt-3 text-2xl font-semibold text-neutral-900 dark:text-white">이적 시장</h1>
        <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
          자금으로 선수를 영입하고, 안 쓰는 선수는 방출해 회수합니다. 시세는 선수를 <span className="font-medium text-rose-600 dark:text-rose-400">키우면(OVR 성장) 오르고 시즌마다 변하니</span>, 싼 유망주를 영입해 경기로 키운 뒤 비싸게 팔면 차익이 남습니다. 영입한 선수는 보유 스쿼드에 들어가고, 선발 라인업은 빌더에서 짭니다.
        </p>
        <TransferClient funds={team.funds} pool={pool} owned={squad} seasonNo={team.seasonNo} />
      </div>
    </main>
  );
}
