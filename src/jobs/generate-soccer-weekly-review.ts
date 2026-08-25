// 축구 빅5 주간 리뷰 ANALYSIS 자동 발행 — 결과·MVP 선수(weekly-xi 재사용)·MVP 감독·이변.
// 주 1회(화). 같은 주 재실행은 slug 로 스킵. 얇은 주(3경기 미만)는 발행하지 않는다.
// 사용: npm run job:soccer-weekly  (특정 리그/날짜: -- --league=EPL --end=2026-08-25 [--dry])
import "@/lib/env";
import { prisma } from "@/lib/db";
import { generateWithMinLength } from "@/lib/ai/generate-with-min-length";
import { SYSTEM_PROMPT } from "@/prompts/system";
import { buildSoccerWeeklyReview, type SoccerWeeklyReviewData } from "@/lib/soccer/weekly-review";
import { buildSoccerWeeklyReviewPrompt } from "@/prompts/soccer-weekly-review";

const LEAGUES = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"] as const;
const MIN_WEEK_MATCHES = 3;
const MIN_LENGTH = 2000;

function extractTitle(md: string): string {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : "축구 주간 리뷰";
}

/**
 * 결정론적 팩트 게이트 — 본문이 인용한 스코어가 실제 이번 주 결과에 있는 조합인지 확인.
 * LLM 판정은 불안정하므로 수치 대조만 하드 게이트로 둔다(야구 주간 글과 같은 원칙).
 */
export function checkWeeklyReviewFacts(content: string, d: SoccerWeeklyReviewData): string[] {
  const errors: string[] = [];
  const validPairs = new Set(d.matches.flatMap((m) => [`${m.homeScore}:${m.awayScore}`, `${m.awayScore}:${m.homeScore}`]));
  for (const m of content.matchAll(/(\d{1,2})\s*[:대-]\s*(\d{1,2})/g)) {
    const pair = `${m[1]}:${m[2]}`;
    // 시각(예: 22:30)이나 승점 표기가 아닌, 축구 스코어 범위만 검사
    if (Number(m[1]) > 12 || Number(m[2]) > 12) continue;
    if (!validPairs.has(pair)) errors.push(`본문 스코어 ${pair} 가 이번 주 결과에 없음`);
  }
  if (d.mvpPlayer) {
    const r = d.mvpPlayer.rating.toFixed(2);
    if (!content.includes(d.mvpPlayer.name)) errors.push(`MVP 선수 ${d.mvpPlayer.name} 미언급`);
    else if (!content.includes(r) && !content.includes(d.mvpPlayer.rating.toFixed(1))) {
      errors.push(`MVP 평점 ${r} 미인용`);
    }
  }
  if (d.mvpCoach && !content.includes(d.mvpCoach.coachKo)) {
    errors.push(`MVP 감독 ${d.mvpCoach.coachKo} 미언급`);
  }
  return errors;
}

interface RunOpts {
  league?: string;
  end?: string; // KST YYYY-MM-DD (포함)
  dry?: boolean;
}

export async function runSoccerWeeklyReview(opts: RunOpts = {}): Promise<number> {
  const leagues = opts.league ? [opts.league] : [...LEAGUES];
  const end = opts.end ?? new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  let published = 0;
  console.log(`[soccer-weekly] 시작 (${leagues.join(",")}) 창 종료 ${end}`);

  for (const league of leagues) {
    try {
      const slug = `${league.toLowerCase()}-weekly-review-${end}`;
      // 같은 주 다른 날짜 slug 도 막는다 — 주 단위 멱등은 창 종료일이 아니라 "최근 6일 내 발행" 기준
      const recent = await prisma.article.findFirst({
        where: {
          league,
          slug: { startsWith: `${league.toLowerCase()}-weekly-review-` },
          publishedAt: { gte: new Date(Date.now() - 6 * 86400000) },
        },
        select: { id: true, slug: true },
      });
      if (recent) {
        console.log(`[soccer-weekly] ${league} 이번 주 글 이미 있음 (${recent.slug}) — 스킵`);
        continue;
      }

      const data = await buildSoccerWeeklyReview(league, end);
      if (!data || data.matchCount < MIN_WEEK_MATCHES) {
        console.log(`[soccer-weekly] ${league} 이번 주 ${data?.matchCount ?? 0}경기 — 얇은 주 스킵`);
        continue;
      }

      const prompt = buildSoccerWeeklyReviewPrompt(data);
      if (opts.dry) {
        console.log(`\n===== [DRY] ${league} → ${slug} =====`);
        console.log(prompt);
        continue;
      }

      const content = await generateWithMinLength(prompt, {
        system: SYSTEM_PROMPT,
        maxTokens: 6000,
        temperature: 0.6,
        minLength: MIN_LENGTH,
        label: `soccer-weekly ${league}`,
      });
      if (!content) {
        console.log(`[soccer-weekly] ${league} 본문 길이 미달 — 스킵`);
        continue;
      }

      const factErrors = checkWeeklyReviewFacts(content, data);
      if (factErrors.length > 0) {
        console.log(`[soccer-weekly] ${league} 팩트 게이트 실패 — 발행 안 함:\n  ${factErrors.join("\n  ")}`);
        continue;
      }

      const article = await prisma.article.create({
        data: {
          type: "ANALYSIS",
          league,
          title: extractTitle(content),
          slug,
          content,
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });
      published++;
      console.log(`[soccer-weekly] ${league} 발행 완료 — #${article.id} ${slug}`);
    } catch (e) {
      console.error(`[soccer-weekly] ${league} 실패:`, (e as Error).message);
    }
  }
  console.log(`[soccer-weekly] 종료 — ${published}건 발행`);
  return published;
}

// CLI 직접 실행
if (process.argv[1]?.includes("generate-soccer-weekly-review")) {
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
  runSoccerWeeklyReview({
    league: arg("league"),
    end: arg("end"),
    dry: process.argv.includes("--dry"),
  })
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
