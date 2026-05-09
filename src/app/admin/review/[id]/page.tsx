import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import ReviewForm from "./ReviewForm";

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
