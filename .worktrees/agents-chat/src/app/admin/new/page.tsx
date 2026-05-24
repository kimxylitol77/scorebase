import { prisma } from "@/lib/db";
import Link from "next/link";
import NewArticleForm from "./NewArticleForm";

export const dynamic = "force-dynamic";

export default async function NewArticlePage() {
  // 매치 연결을 돕기 위해 다음 14일 SCHEDULED + 최근 14일 FINISHED 매치 일부 노출
  const now = new Date();
  const past = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const future = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const matches = await prisma.match.findMany({
    where: {
      OR: [
        { status: "SCHEDULED", startTime: { gte: now, lte: future } },
        { status: "FINISHED", startTime: { gte: past } },
      ],
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { startTime: "desc" },
    take: 30,
  });

  const matchOptions = matches.map((m) => ({
    id: m.id,
    label: `[${m.league}] ${m.homeTeam.name} ${m.homeScore ?? "-"}:${m.awayScore ?? "-"} ${m.awayTeam.name} (${m.startTime.toISOString().slice(0, 10)}, ${m.status})`,
  }));

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <header>
        <Link
          href="/admin"
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
        >
          ← 관리자 메인
        </Link>
        <h1 className="text-2xl font-bold tracking-tight mt-1">새 글 작성</h1>
        <p className="mt-1 text-sm text-neutral-500">
          관리자가 직접 작성하는 글. AI 생성 글과 동일한 형식으로 저장되며, 매치 연결 시 인사이트 박스가 자동 표시됩니다.
        </p>
      </header>

      <NewArticleForm matchOptions={matchOptions} />
    </div>
  );
}
