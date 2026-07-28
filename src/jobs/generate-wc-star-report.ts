// 월드컵 STAR 리포트 자동 발행 — 그날의 주인공(MOM·멀티골) 선수 단독 글.
// 베스트11(team-of-day) cron 에 피기백: 그날 전 경기 종료 후에만 발행(idempotent).
// 사용: npm run job:wc-star  (특정 날짜: npm run job:wc-star -- 2026-07-07 [--dry])
import "@/lib/env";
import { prisma } from "@/lib/db";
import { generateWithMinLength } from "@/lib/ai/generate-with-min-length";
import { SYSTEM_PROMPT } from "@/prompts/system";
import { latestFinishedDateKst } from "@/lib/sports/thesports/team-of-day";
import { pendingMatchCount } from "@/jobs/generate-team-of-day-article";
import {
  getStarCandidates,
  buildStarSlug,
  type StarReportData,
} from "@/lib/sports/thesports/wc-star-report";
import { buildStarReportPrompt } from "@/prompts/wc-star-report";
import { sendTelegramPhoto } from "@/lib/notify/telegram";
import { snsLink } from "@/lib/site-url";

function extractTitle(md: string): string {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : "월드컵 STAR 리포트";
}

/** 텔레그램 SNS 캡션 — 선수 사진 카드용. 500자 이내. */
function buildStarCaption(d: StarReportData, url: string): string {
  const scope =
    d.match.oppKo && d.match.teamScore != null
      ? `vs ${d.match.oppKo} ${d.match.teamScore}-${d.match.oppScore}`
      : "";
  const tag = d.reason === "MOM" ? "이날의 MOM" : "멀티골 주인공";
  return [
    `⭐ ${d.dateKo} 월드컵 STAR — ${d.flag} ${d.name}`,
    `${tag} · 경기 평점 ${d.rating.toFixed(1)} ${scope}`.trim(),
    d.tourney.goals || d.tourney.assists
      ? `대회 누적 ${d.tourney.goals}골 ${d.tourney.assists}도움`
      : "",
    "",
    url,
    "#월드컵 #Scorebase #스코어베이스",
  ]
    .filter(Boolean)
    .join("\n");
}

interface RunOpts {
  date?: string; // KST YYYY-MM-DD (미지정 시 최근 완료일)
  dry?: boolean; // 발행 없이 후보·프롬프트만 로그
}

export async function runWcStarReport(opts: RunOpts = {}) {
  console.log("[wc-star] 시작");
  const date = opts.date ?? (await latestFinishedDateKst());
  if (!date) {
    console.log("[wc-star] 완료 경기 없음 — skip");
    return;
  }

  // 베스트11 과 동일한 전경기 종료 가드 — 그날 경기가 남아 있으면 보류(다음 tick 재시도).
  const pending = await pendingMatchCount(date);
  if (pending > 0) {
    console.log(`[wc-star] ${date} 아직 ${pending}경기 진행/예정 — 전 경기 종료 후 발행`);
    return;
  }

  const candidates = await getStarCandidates(date);
  if (candidates.length === 0) {
    console.log(`[wc-star] ${date} STAR 후보 없음 — skip`);
    return;
  }

  for (const d of candidates) {
    const slug = buildStarSlug(date, d.playerId);
    const existing = await prisma.article.findUnique({ where: { slug } });
    if (existing) {
      console.log(`[wc-star] ${d.name} (${d.reason}) 글 이미 있음 (#${existing.id}) — skip`);
      continue;
    }

    const prompt = buildStarReportPrompt(d);
    if (opts.dry) {
      console.log(`\n===== [DRY] ${d.name} (${d.reason}) → ${slug} =====`);
      console.log(prompt);
      continue;
    }

    const content = await generateWithMinLength(prompt, {
      system: SYSTEM_PROMPT,
      maxTokens: 7000,
      temperature: 0.6,
      minLength: 2400,
      label: "wc-star",
    });
    if (!content) {
      console.log(`[wc-star] ${d.name} 본문 길이 미달 — skip`);
      continue;
    }

    const title = extractTitle(content);
    const article = await prisma.article.create({
      data: {
        type: "ANALYSIS",
        league: "WORLD_CUP",
        title,
        slug,
        content,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    console.log(
      `[wc-star] ✅ #${article.id} ${title} (${content.length}자) → /articles/${slug}`,
    );

    // SNS 카드 — 선수 사진 + 캡션을 텔레그램으로 (수동 게시용). 사진 없으면 skip.
    if (d.photo) {
      try {
        await sendTelegramPhoto(d.photo, buildStarCaption(d, snsLink(`/articles/${slug}`, "threads")));
        console.log(`[wc-star] 텔레그램 카드 전송 — ${d.name}`);
      } catch (e) {
        console.warn(`[wc-star] 텔레그램 전송 실패(${d.name}):`, (e as Error).message);
      }
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const date = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  runWcStarReport({ date, dry })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
