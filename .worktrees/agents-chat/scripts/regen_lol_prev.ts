import "@/lib/env";
import { prisma } from "@/lib/db";
import { runPreview } from "@/jobs/generate-previews";
(async () => {
  await prisma.article.deleteMany({ where: { league: "LOL", type: "PREVIEW" } });
  await runPreview({ autoPublish: true, league: "LOL", horizonDays: 7, take: 20 });
  const pub = await prisma.article.findMany({
    where: { league: "LOL", type: "PREVIEW", status: "PUBLISHED" },
    select: { id: true, slug: true, content: true },
    orderBy: { publishedAt: "desc" },
  });
  console.log(`\nPUBLISHED ${pub.length}개:`);
  for (const p of pub) {
    const last = p.content.slice(-50);
    const hasClosing = p.content.includes("베팅 권유가 아닙니다");
    console.log(`  #${p.id} (${p.content.length}자) ${hasClosing ? "✅ 면책 OK" : "❌ 잘림"}`);
  }
  await prisma.$disconnect();
})();
