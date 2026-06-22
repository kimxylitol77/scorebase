// 자유 드림팀 구성 — 예산·제약 없이 현역 선수 자유 배치 (공개, 재미용)
import type { Metadata } from "next";
import { allDreamPlayers } from "@/lib/dream-team/pool";
import DreamTeamBuilder from "../DreamTeamBuilder";
import DreamTeamNav from "../DreamTeamNav";
import AmbientGlow from "@/components/AmbientGlow";

export const metadata: Metadata = {
  title: "자유 드림팀 구성 | Scorebase",
  description: "예산·제약 없이 빅5 현역 선수를 마음껏 골라 나만의 환상 라인업을 구성하세요.",
};

export default function FreePage() {
  const pool = allDreamPlayers();
  return (
    <main className="relative mx-auto max-w-5xl px-4 py-10">
      <AmbientGlow />
      <div className="relative">
        <DreamTeamNav />
        <span className="inline-block rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-300 dark:ring-rose-500/30">
          자유 구성
        </span>
        <h1 className="mt-3 text-2xl font-semibold text-neutral-900 dark:text-white">자유 드림팀</h1>
        <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
          예산·제약 없이 빅5 현역 선수를 마음껏 골라 나만의 환상 라인업을 만들어보세요. 선수를 누르면 능력치를 볼 수 있어요.
        </p>
        <DreamTeamBuilder pool={pool} initial={null} tierKey="amateur" topTeams={[]} freeMode />
      </div>
    </main>
  );
}
