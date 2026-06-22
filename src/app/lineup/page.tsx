// 라인업 전술판 — 포메이션 보드에 선수를 배치해 베스트 11을 만들고 이미지 카드로 공유 (공개 도구).
import type { Metadata } from "next";
import { allDreamPlayers } from "@/lib/dream-team/pool";
import { decodeLineup } from "@/lib/lineup/lineup-state";
import LineupBuilder from "./LineupBuilder";
import AmbientGlow from "@/components/AmbientGlow";

export const metadata: Metadata = {
  title: "라인업 전술판 | Scorebase",
  description: "포메이션 보드에 빅5 현역 선수를 배치해 나만의 베스트 11을 만들고 이미지 카드로 공유하세요.",
};

export default async function LineupPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams;
  const initial = d ? decodeLineup(d) : null;
  // 빌더에는 필요한 6개 필드만 슬림하게 전달(radar 등 무거운 필드 제외).
  const pool = allDreamPlayers().map((p) => ({
    id: p.id,
    name: p.name,
    pos: p.pos,
    ovr: p.ovr,
    team: p.team,
    photo: p.photo,
  }));

  return (
    <main className="relative mx-auto max-w-5xl px-4 py-10">
      <AmbientGlow />
      <div className="relative">
        <span className="inline-block rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-300 dark:ring-rose-500/30">
          전술판
        </span>
        <h1 className="mt-3 text-2xl font-semibold text-neutral-900 dark:text-white">라인업 전술판</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
          포메이션을 고르고 빅5 현역 선수를 배치해 나만의 베스트 11을 완성하세요. 직접 이름을 입력할 수도 있고, 완성한 라인업은 이미지 카드로 저장·공유됩니다.
        </p>
        <LineupBuilder pool={pool} initial={initial} />
      </div>
    </main>
  );
}
