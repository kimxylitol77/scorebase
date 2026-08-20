// 내용 없는 브리핑을 /news 목록에서만 숨긴다.
// 소스가 제목만 줘서 "…라고 보도했습니다 + 추가 내용은 확인되지 않았습니다" 로 끝나는 글이
// 발행분의 60% 였다(2026-08-20). 재료 게이트(MIN_MATERIAL_CHARS)가 앞으로는 막지만
// 이미 나간 글은 남아 있어 목록 품질을 떨어뜨린다.
//
// category 를 BRIEFING → BRIEFING_LEGACY 로 바꿀 뿐이라 글 URL(/analysis/{id})과 색인은
// 그대로 살아 있다. 어떤 글을 숨겼는지는 NewsBriefing.note 에 표시해 되돌릴 수 있게 한다.
// 실행: node --env-file=.env.local scripts/hide-thin-briefings.mjs [DRY=1|REVERT=1]
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DRY = process.env.DRY === "1";
const REVERT = process.env.REVERT === "1";

// 정보가 없다는 것을 스스로 밝히는 문구 — 재료 부족의 확실한 신호
const EMPTY_RE =
  /(확인되지 않았습니다|추가 내용은|구체적인 내용은|추후 보도|세부 사항은 아직|알려지지 않았습니다|자세한 내용은 전해지지)/;
const MAX_BODY_LEN = 400; // 문구가 있어도 본문이 이보다 길면 실질 내용이 있다고 본다

if (REVERT) {
  const marked = await prisma.newsBriefing.findMany({
    where: { note: { contains: "thin-hidden" } },
    select: { postId: true },
  });
  const ids = marked.map((m) => m.postId).filter((v) => v !== null);
  const r = await prisma.post.updateMany({
    where: { id: { in: ids }, category: "BRIEFING_LEGACY" },
    data: { category: "BRIEFING" },
  });
  console.log(`되돌림: ${r.count}건 → BRIEFING`);
  await prisma.$disconnect();
  process.exit(0);
}

const posts = await prisma.post.findMany({
  where: { category: "BRIEFING" },
  select: { id: true, title: true, content: true },
});

const thin = posts.filter((p) => {
  const body = p.content.split("\n---\n")[0].trim();
  return EMPTY_RE.test(body) && body.length < MAX_BODY_LEN;
});

console.log(`노출 중 ${posts.length}건 중 내용 없는 글 ${thin.length}건`);
for (const t of thin.slice(0, 8)) {
  console.log(`  ${t.id} [${t.content.split("\n---\n")[0].trim().length}자] ${t.title.slice(0, 55)}`);
}

if (DRY) {
  console.log("DRY — 변경 없음");
} else {
  const ids = thin.map((t) => t.id);
  const r = await prisma.post.updateMany({
    where: { id: { in: ids } },
    data: { category: "BRIEFING_LEGACY" },
  });
  // 되돌릴 수 있게 표시 — 비공신력 숨김분과 구분된다
  await prisma.$executeRawUnsafe(
    `UPDATE "NewsBriefing" SET note = coalesce(note,'') || ' thin-hidden' WHERE "postId" = ANY($1::int[])`,
    ids,
  );
  console.log(`숨김 적용: ${r.count}건 → BRIEFING_LEGACY`);
  console.log(`/news 목록에 남는 글: ${await prisma.post.count({ where: { category: "BRIEFING" } })}건`);
}
await prisma.$disconnect();
