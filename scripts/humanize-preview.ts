// 심판봇 점검 CLI — 기존 글을 채점하고(무료), --revise 면 고쳐쓰기까지 돌려 본다. DB 에 저장하지 않는다.
//   npm run humanize:check -- --recent 10            # 최근 발행 프리뷰·리뷰 10건 점수 분포
//   npm run humanize:check -- --id 4754              # 1건 채점 + 감점 사유
//   npm run humanize:check -- --id 4754 --revise     # 1건 고쳐쓰기(LLM 1~2회) + 불변 검증 + 전후 본문 출력
import { prisma } from "@/lib/db";
import { humanizeArticle, scoreHumanness } from "@/lib/articles/humanize";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? "true") : null;
}

async function main() {
  const id = arg("id");
  const recent = arg("recent");
  const revise = process.argv.includes("--revise");

  if (recent) {
    const rows = await prisma.article.findMany({
      where: { type: { in: ["PREVIEW", "RECAP"] }, status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
      take: Number(recent),
      select: { id: true, league: true, type: true, content: true },
    });
    for (const a of rows) {
      const s = scoreHumanness(a.content);
      console.log(`#${a.id} ${a.type} ${a.league} ${String(s.score).padStart(3)}점 cv=${s.metrics.cv} 해설=${s.metrics.closerRatio} 강조=${s.metrics.intensifiersPer1k} 줄표=${s.metrics.emDashPer1k} 라벨세트=${s.metrics.boldLabelSets}`);
    }
    const scores = rows.map((a) => scoreHumanness(a.content).score).sort((x, y) => x - y);
    console.log(`중앙값 ${scores[Math.floor(scores.length / 2)]}점 · 최저 ${scores[0]} · 최고 ${scores[scores.length - 1]}`);
  } else if (id) {
    const a = await prisma.article.findUnique({ where: { id: Number(id) }, select: { id: true, league: true, type: true, content: true } });
    if (!a) throw new Error(`article #${id} 없음`);
    const s = scoreHumanness(a.content);
    console.log(`#${a.id} ${a.type} ${a.league} ${s.score}점`, s.metrics);
    for (const f of s.findings) console.log("  -", f);
    if (revise) {
      const r = await humanizeArticle(a.content, { label: `check#${a.id}`, threshold: 100 });
      console.log(`\n=== 결과: ${r.before}→${r.after}점, ${r.rounds}회 호출, ${r.accepted ? "채택" : "원문 유지"}`);
      for (const x of r.rejections) console.log("  폐기:", x);
      if (r.accepted) {
        console.log("\n=== 고친 본문\n" + r.content);
        const after = scoreHumanness(r.content);
        console.log("\n=== 남은 감점 사유"); for (const f of after.findings) console.log("  -", f);
      }
    }
  } else {
    console.log("사용법: --recent N | --id N [--revise]");
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
