// 관리자 초안 미리보기 — 발행 전 글을 실제 본문 모양(마크다운 + 전술 도식)으로 확인한다. /admin 레이아웃이 로그인을 검사한다.
// 공개 글 페이지(/articles/[slug])는 10분 캐시로 돌아 쿠키를 읽을 수 없어서, 미리보기를 관리자 경로에 따로 뒀다.
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import TacticalBody from "@/components/tactical/TacticalBody";
import TacticalManagerSection from "@/components/TacticalManagerSection";
import { toKoreanTeamName } from "@/lib/team-names";
import type { TacticalManagerContext } from "@/lib/tactical/manager-aggregate";

export const dynamic = "force-dynamic";
export const metadata = { title: "초안 미리보기", robots: { index: false, follow: false } };

export default async function ArticlePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const article = await prisma.article.findUnique({
    where: { id },
    include: { match: { include: { homeTeam: true, awayTeam: true } } },
  });
  if (!article) notFound();
  const match =
    article.type === "TACTICAL" && article.match
      ? {
          id: article.match.id,
          home: toKoreanTeamName(article.match.homeTeam.name, article.league) || article.match.homeTeam.name,
          away: toKoreanTeamName(article.match.awayTeam.name, article.league) || article.match.awayTeam.name,
        }
      : null;
  // tacticalContext 는 JSON 문자열로 저장된다 (이달의 감독·시즌 결산 글의 대시보드 데이터)
  let manager: TacticalManagerContext | null = null;
  if (!article.match && article.tacticalContext) {
    try {
      manager = JSON.parse(article.tacticalContext) as TacticalManagerContext;
    } catch {
      manager = null;
    }
  }
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl bg-amber-100 px-4 py-3 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
        <b>미리보기</b>
        <span>
          #{article.id} · {article.type} · {article.league} · 상태 {article.status}
        </span>
        <span className="text-amber-700 dark:text-amber-200/70">{article.content.length.toLocaleString()}자</span>
        <Link href="/admin/articles?status=DRAFT" className="ml-auto underline">
          초안 목록으로
        </Link>
      </div>
      {manager && <TacticalManagerSection ctx={manager} />}
      <article>
        <TacticalBody content={article.content} match={match} />
      </article>
    </main>
  );
}
