// 야구 주간 리그 리뷰 ANALYSIS 자동 발행 — 순위·이번 주 결과·팀 지표 기반 (선수 데이터 불필요).
// KBO 는 색인되는 글(ANALYSIS) 이 0 이던 문제 해소용. 주 1회 발행, 같은 주 재실행은 slug 로 스킵.
// 사용: npm run job:baseball-weekly  (특정 리그/날짜: -- KBO 2026-07-09 [--dry])
import "@/lib/env";
import { prisma } from "@/lib/db";
import { generateWithMinLength } from "@/lib/ai/generate-with-min-length";
import { SYSTEM_PROMPT } from "@/prompts/system";
import { buildBaseballWeeklyReview } from "@/lib/sports/baseball/weekly-review";
import { buildBaseballWeeklyReviewPrompt } from "@/prompts/baseball-weekly-review";

const DEFAULT_LEAGUES = ["KBO", "NPB", "MLB"] as const;

function extractTitle(md: string): string {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : "야구 주간 리뷰";
}

/** 그 주 월요일(KST) 날짜 — 주 단위 idempotent slug 용. */
function weekStartKst(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 3600000);
  const day = kst.getUTCDay() || 7; // 월=1 … 일=7
  const monday = new Date(kst.getTime() - (day - 1) * 86400000);
  return monday.toISOString().slice(0, 10);
}

interface RunOpts {
  leagues?: readonly string[];
  refDate?: Date;
  dry?: boolean;
}

export async function runBaseballWeeklyReview(opts: RunOpts = {}) {
  const leagues = opts.leagues ?? DEFAULT_LEAGUES;
  const refDate = opts.refDate ?? new Date();
  console.log(`[baseball-weekly] 시작 (${leagues.join(",")})`);

  for (const league of leagues) {
    try {
      const slug = `${league.toLowerCase()}-weekly-${weekStartKst(refDate)}`;
      const existing = await prisma.article.findUnique({ where: { slug } });
      if (existing) {
        console.log(`[baseball-weekly] ${league} 이번 주 글 이미 있음 (#${existing.id}) — 스킵`);
        continue;
      }

      const data = await buildBaseballWeeklyReview(league, refDate);
      if (!data) {
        console.log(`[baseball-weekly] ${league} 팀 시즌 스탯 부족 — 스킵`);
        continue;
      }
      if (data.gamesThisWeek < 5) {
        console.log(`[baseball-weekly] ${league} 이번 주 ${data.gamesThisWeek}경기 — 얇은 주 스킵`);
        continue;
      }

      const prompt = buildBaseballWeeklyReviewPrompt(data);
      if (opts.dry) {
        console.log(`\n===== [DRY] ${league} → ${slug} =====`);
        console.log(prompt);
        continue;
      }

      const content = await generateWithMinLength(prompt, {
        system: SYSTEM_PROMPT,
        maxTokens: league === "MLB" ? 10000 : 6000, // MLB 는 6지구라 본문이 길다
        temperature: 0.6,
        minLength: 2400,
        label: `baseball-weekly ${league}`,
      });
      if (!content) {
        console.log(`[baseball-weekly] ${league} 본문 길이 미달 — 스킵`);
        continue;
      }

      const title = extractTitle(content);
      const article = await prisma.article.create({
        data: {
          type: "ANALYSIS",
          league,
          title,
          slug,
          content,
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });
      console.log(
        `[baseball-weekly] ✅ ${league} #${article.id} ${title} (${content.length}자) → /articles/${slug}`,
      );

      await new Promise((r) => setTimeout(r, 5000));
    } catch (e) {
      console.error(`[baseball-weekly] ${league} 실패:`, (e as Error).message?.slice(0, 120));
    }
  }

  console.log("[baseball-weekly] 완료");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const dateArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const leagueArgs = args.filter((a) => /^[A-Z_]+$/.test(a));
  runBaseballWeeklyReview({
    leagues: leagueArgs.length ? leagueArgs : undefined,
    refDate: dateArg ? new Date(`${dateArg}T12:00:00+09:00`) : undefined,
    dry,
  })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
