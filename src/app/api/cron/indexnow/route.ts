// IndexNow 제출 cron — 최근 26h 내 발행/갱신된 Article·Blog·선수(몸값 변동) URL 을 빙·얀덱스에 색인 요청. 매일.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { submitIndexNow } from "@/lib/indexnow";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  if (!authorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  try {
    const since = new Date(Date.now() - 26 * 3600 * 1000);
    const [articles, blogs, players] = await Promise.all([
      prisma.article.findMany({
        where: { status: "PUBLISHED", publishedAt: { gte: since } },
        select: { slug: true },
      }),
      prisma.blog.findMany({ where: { publishedAt: { gte: since } }, select: { slug: true } }),
      // 선수 페이지 — updatedAt 은 몸값이 실제 바뀔 때만 갱신(일 0~7건 실측)이라 스팸성 재제출 없음.
      // sitemap 과 동일하게 리그 판명 선수만(league null 은 thin 제외).
      prisma.playerMarketValue.findMany({
        where: { updatedAt: { gte: since }, league: { not: null } },
        select: { id: true },
      }),
    ]);
    const urls = [
      ...articles.map((a) => `${SITE_URL}/articles/${a.slug}`),
      ...blogs.map((b) => `${SITE_URL}/blog/${b.slug}`),
      ...players.map((p) => `${SITE_URL}/transfers/${p.id}`),
    ];
    const r = await submitIndexNow(urls);
    await recordCronRun("indexnow", { ok: r.ok, count: r.count });
    return NextResponse.json({ ...r, articles: articles.length, blogs: blogs.length, players: players.length });
  } catch (e) {
    await recordCronRun("indexnow", { ok: false, error: (e as Error).message });
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
