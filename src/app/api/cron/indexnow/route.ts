// IndexNow 제출 cron — 최근 26h 내 발행/갱신된 Article·Blog URL 을 빙·얀덱스에 색인 요청. 매일.
import { NextResponse } from "next/server";
import { recordCronRun } from "@/lib/cron-registry";
import { submitIndexNow } from "@/lib/indexnow";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  try {
    const since = new Date(Date.now() - 26 * 3600 * 1000);
    const [articles, blogs] = await Promise.all([
      prisma.article.findMany({
        where: { status: "PUBLISHED", publishedAt: { gte: since } },
        select: { slug: true },
      }),
      prisma.blog.findMany({ where: { publishedAt: { gte: since } }, select: { slug: true } }),
    ]);
    const urls = [
      ...articles.map((a) => `${SITE_URL}/articles/${a.slug}`),
      ...blogs.map((b) => `${SITE_URL}/blog/${b.slug}`),
    ];
    const r = await submitIndexNow(urls);
    await recordCronRun("indexnow", { ok: r.ok, count: r.count });
    return NextResponse.json({ ...r, articles: articles.length, blogs: blogs.length });
  } catch (e) {
    await recordCronRun("indexnow", { ok: false, error: (e as Error).message });
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
