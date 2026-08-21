// 오버/언더 허브 블로그 글 수동 발행 — 로직은 src/lib/stats/over-under-blog.ts 가 갖고 있고
// 주간 cron(/api/cron/over-under-blog)도 같은 함수를 부른다.
//   npx tsx --env-file=.env.local scripts/publish-over-under-blog.ts
import { prisma } from "@/lib/db";
import { buildAndSaveOverUnderBlog } from "@/lib/stats/over-under-blog";

async function main() {
  const r = await buildAndSaveOverUnderBlog();
  console.log(`✓ https://www.scorebase.kr/blog/${r.slug} (#${r.id})`);
  console.log(`  리그 ${r.leagues}개 · 경기 ${r.matches.toLocaleString()} · 본문 공백제외 ${r.chars}자`);
  await prisma.$disconnect();
}
main();
