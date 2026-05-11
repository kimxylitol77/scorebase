// 특정 LoL RECAP 글 1건을 재발행 — slug 또는 articleId 인자.
// 기존 article body 를 backup 컬럼 없이 덮어쓰기 (lolContext 도 재계산).
//
// 사용:
//   npx tsx src/jobs/regenerate-lol-recap.ts lol-recap-11323
//   npx tsx src/jobs/regenerate-lol-recap.ts 564

import "@/lib/env";
import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/openai";
import { SYSTEM_PROMPT } from "@/prompts/system";
import { buildLolRecapPromptV2 } from "@/prompts/lol-recap";
import { buildLolRecapContext } from "@/lib/sports/lol-recap-context";
import { titleDatePrefixKST } from "@/lib/format";

function extractTitle(md: string): string {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : "LCK 매치 리뷰";
}

export async function regenerateLolRecap(
  identifier: string | number,
): Promise<{ ok: boolean; articleId?: number; slug?: string; bodyLength?: number; error?: string }> {
  // identifier: slug 또는 articleId
  const where =
    typeof identifier === "number" || /^\d+$/.test(String(identifier))
      ? { id: Number(identifier) }
      : { slug: String(identifier) };

  const article = await prisma.article.findFirst({
    where: { ...where, league: "LOL", type: "RECAP" },
    include: {
      match: { include: { homeTeam: true, awayTeam: true } },
    },
  });
  if (!article || !article.match) {
    return { ok: false, error: "article 또는 match 미존재" };
  }
  const m = article.match;

  console.log(
    `[regenerate-lol-recap] #${article.id} ${m.homeTeam.name} ${m.homeScore}-${m.awayScore} ${m.awayTeam.name}`,
  );

  const ctx = await buildLolRecapContext({
    externalId: m.externalId,
    startTime: m.startTime,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    homeTeam: {
      id: m.homeTeam.id,
      name: m.homeTeam.name,
      externalId: m.homeTeam.externalId,
    },
    awayTeam: {
      id: m.awayTeam.id,
      name: m.awayTeam.name,
      externalId: m.awayTeam.externalId,
    },
    raw: m.raw,
  });
  if (!ctx) return { ok: false, error: "context 빌드 실패 (매치 미종료?)" };

  const prompt = buildLolRecapPromptV2(ctx);
  const content = await generate(prompt, {
    system: SYSTEM_PROMPT,
    maxTokens: 2500,
    temperature: 0.6,
  });

  const rawTitle = extractTitle(content);
  const prefix = titleDatePrefixKST(m.startTime);
  const title = rawTitle.startsWith("[") ? rawTitle : `${prefix} ${rawTitle}`;

  const updated = await prisma.article.update({
    where: { id: article.id },
    data: {
      title,
      content,
      lolContext: JSON.stringify(ctx),
      updatedAt: new Date(),
    },
  });
  return {
    ok: true,
    articleId: updated.id,
    slug: updated.slug,
    bodyLength: content.length,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2];
  if (!arg) {
    console.error("사용: npx tsx src/jobs/regenerate-lol-recap.ts <slug 또는 articleId>");
    process.exit(1);
  }
  regenerateLolRecap(arg)
    .then((r) =>
      console.log(
        r.ok
          ? `✅ #${r.articleId} /articles/${r.slug} 재발행 — ${r.bodyLength}자`
          : `❌ 실패: ${r.error}`,
      ),
    )
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
