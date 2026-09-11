// 가이드 페이지(고정 공지) 발행·갱신 — docs/site-guide/site-guide.md 본문을 slug `site-guide` 로 upsert.
// 메뉴가 바뀌면 md 를 고치고 다시 실행한다. pinned=true 라 /notices 최상단에 고정된다.
//   npx tsx --env-file=.env.local scripts/post-notice-site-guide.ts
import { readFileSync } from "fs";
import path from "path";
import { prisma } from "@/lib/db";

async function main() {
  const content = readFileSync(path.join(process.cwd(), "docs/site-guide/site-guide.md"), "utf8").trim();
  const n = await prisma.notice.upsert({
    where: { slug: "site-guide" },
    create: {
      slug: "site-guide",
      type: "NOTICE",
      title: "스코어베이스 가이드 페이지 — 메뉴와 데이터 전체 안내",
      content,
      pinned: true,
    },
    update: { content, pinned: true, title: "스코어베이스 가이드 페이지 — 메뉴와 데이터 전체 안내" },
  });
  console.log(`가이드 공지 upsert 완료 — #${n.id} /notices/${n.slug} (pinned=${n.pinned}, ${content.length}자)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
