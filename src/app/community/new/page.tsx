// 자유게시판 글쓰기 — 제목·본문 + 선택 첨부(내 드림팀 자랑 / 전술판 공유 링크)
import Link from "next/link";
import { redirect } from "next/navigation";
import AmbientGlow from "@/components/AmbientGlow";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { TIERS } from "@/lib/dream-team/tiers";
import BoardForm from "./BoardForm";

export const dynamic = "force-dynamic";

export default async function NewBoardPostPage({ searchParams }: { searchParams: Promise<{ lineup?: string }> }) {
  // 전술판 "게시판에 올리기" 진입 — ?lineup={d코드} 를 폼에 미리 채움 (로그인 리다이렉트에도 보존)
  const { lineup } = await searchParams;
  const lineupCode = lineup && /^[A-Za-z0-9_\-~.%]+$/.test(lineup) && lineup.length <= 4000 ? lineup : null;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?from=${encodeURIComponent(`/community/new${lineupCode ? `?lineup=${lineupCode}` : ""}`)}`);
  }

  // 내 드림팀 — 있으면 첨부 체크박스에 팀명 노출
  const team = await prisma.dreamTeam.findFirst({
    where: { userId: user.id },
    select: { name: true, tier: true },
  });

  return (
    <main className="relative max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
      <AmbientGlow />
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden /> 자유게시판
          </span>
          <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight break-keep">글쓰기</h1>
        </div>
        <Link
          href="/analysis?board=free"
          className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-4 py-2.5 text-sm font-semibold ring-1 ring-black/10 backdrop-blur transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-white dark:bg-white/5 dark:ring-white/15 dark:hover:bg-white/10"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden /> 목록
        </Link>
      </div>
      <BoardForm
        myTeam={team ? { name: team.name, tierName: TIERS[team.tier]?.name ?? team.tier } : null}
        defaultLineup={lineupCode}
      />
    </main>
  );
}
