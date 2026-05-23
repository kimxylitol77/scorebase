import { prisma } from "../src/lib/db";
async function main() {
  const b = await prisma.blog.findUnique({ where: { slug: "2026-05-23-kbo-ranking-prediction" } });
  if (!b) { console.log("NOT FOUND"); return; }
  console.log("content 시작 100자:", JSON.stringify(b.content.slice(0, 100)));
  console.log("startsWith <article :", b.content.trim().startsWith("<article"));
  console.log("startsWith &lt;article:", b.content.trim().startsWith("&lt;article"));
  console.log("contains <table?", b.content.includes("<table"));
}
main().catch(console.error).finally(() => prisma.$disconnect());
