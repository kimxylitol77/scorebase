import { prisma } from "@/lib/db";
import { npbPlayerToKorean } from "@/lib/sports/npb-player-names";

function translate(input: string): { out: string; replaced: Map<string, string> } {
  const replaced = new Map<string, string>();
  const tokens = [...new Set(input.match(/[一-鿿぀-ヿ]+/g) ?? [])];
  tokens.sort((a, b) => b.length - a.length);
  let out = input;
  for (const t of tokens) {
    const ko = npbPlayerToKorean(t);
    if (ko !== t) {
      replaced.set(t, ko);
      out = out.split(t).join(ko);
    }
  }
  return { out, replaced };
}

async function main() {
  const since = new Date(Date.now() - 60 * 24 * 3600 * 1000);
  const arts = await prisma.article.findMany({
    where: { league: "NPB", createdAt: { gte: since } },
    select: { id: true, title: true, content: true },
  });
  const jp = /[一-鿿぀-ヿ]+/g;
  let updated = 0, skipped = 0;
  const stillUnmapped = new Map<string, number>();
  for (const a of arts) {
    const t = translate(a.title);
    const c = translate(a.content);
    const allReplaced = new Set([...t.replaced.keys(), ...c.replaced.keys()]);
    if (allReplaced.size === 0) { skipped++; continue; }
    // 잔존 토큰 누적
    for (const tok of [...new Set(t.out.match(jp) ?? []), ...new Set(c.out.match(jp) ?? [])]) {
      stillUnmapped.set(tok, (stillUnmapped.get(tok) ?? 0) + 1);
    }
    await prisma.article.update({
      where: { id: a.id },
      data: { title: t.out, content: c.out },
    });
    updated++;
    console.log(`✅ ${a.id} | ${a.title.slice(0,50)} | 치환 ${allReplaced.size}건`);
  }
  console.log(`\n총 ${arts.length}건 — 업데이트 ${updated}, 스킵 ${skipped}`);
  if (stillUnmapped.size > 0) {
    console.log(`\n아직 잔존 (${stillUnmapped.size}종):`);
    for (const [t, c] of [...stillUnmapped.entries()].sort((a,b) => b[1]-a[1])) console.log(`  ${t} (${c}회)`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
