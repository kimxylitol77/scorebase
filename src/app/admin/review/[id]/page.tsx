import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import ReviewForm from "./ReviewForm";
import TacticalManagerSection from "@/components/TacticalManagerSection";
import type { TacticalManagerContext } from "@/lib/tactical/manager-aggregate";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReviewPage({ params }: Props) {
  const { id } = await params;
  const articleId = Number(id);
  if (!articleId) notFound();

  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: {
      match: { include: { homeTeam: true, awayTeam: true } },
    },
  });

  if (!article) notFound();

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link
          href="/admin"
          className="text-neutral-500 hover:underline"
        >
          ← 검수 목록
        </Link>
      </div>

      {article.match && (
        <div className="rounded-lg bg-neutral-50 dark:bg-neutral-900 p-4 text-sm flex items-center justify-between">
          <span className="font-medium">{article.match.homeTeam.name}</span>
          <span className="text-lg font-bold tabular-nums">
            {article.match.homeScore ?? "-"} : {article.match.awayScore ?? "-"}
          </span>
          <span className="font-medium">{article.match.awayTeam.name}</span>
        </div>
      )}

      {/* 감독 전술 글 — 발행 시 본문 위에 붙는 대시보드를 검수 화면에서도 미리 확인 */}
      {article.tacticalContext && (() => {
        try {
          return <TacticalManagerSection ctx={JSON.parse(article.tacticalContext) as TacticalManagerContext} />;
        } catch {
          return null;
        }
      })()}

      <ReviewForm
        article={{
          id: article.id,
          title: article.title,
          content: article.content,
          league: article.league,
          type: article.type,
        }}
      />
    </div>
  );
}
