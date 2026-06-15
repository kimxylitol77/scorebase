// 월드컵 '오늘의 베스트 XI' 평점 분석 글 자동 생성. 같은 날짜 글 있으면 skip(idempotent).
// getTeamOfDay 의 베스트11 + 각 선수 53스탯(playerStats)을 결정론적으로 프롬프트에
// 주입해 "왜 이 평점인지"를 근거 있게 서술. 사용: npm run job:tod

import "@/lib/env";
import { prisma } from "@/lib/db";
import { generateWithMinLength } from "@/lib/ai/generate-with-min-length";
import { SYSTEM_PROMPT } from "@/prompts/system";
import {
  getTeamOfDay,
  TOD_ARTICLE_SLUG_PREFIX,
  type TodPlayer,
} from "@/lib/sports/thesports/team-of-day";
import {
  buildTeamOfDayAnalysisPrompt,
  type TodAnalysisPlayer,
  type TodRawStats,
} from "@/prompts/team-of-day-analysis";
import { buildTeamOfDayCaption } from "@/lib/threads/caption";
import { sendTelegramPhoto } from "@/lib/notify/telegram";
import { SITE_URL } from "@/lib/site-url";

type RawStatRow = TodRawStats & { player_id: string; rating?: number };

function extractTitle(md: string): string {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : "월드컵 오늘의 베스트 11";
}

/** 그날(KST) 완료 경기들의 playerStats 를 player_id → 최고 평점 행으로 수집. */
/** KST 날짜(YYYY-MM-DD) → 그날 00:00~24:00(KST) 의 UTC startTime 범위. */
function kstRange(date: string): { gte: Date; lt: Date } {
  const startUtcMs = Date.parse(`${date}T00:00:00Z`) - 9 * 3600000;
  return { gte: new Date(startUtcMs), lt: new Date(startUtcMs + 86400000) };
}

/** 그날(KST) 아직 끝나지 않은(SCHEDULED/LIVE 등) 월드컵 경기 수. 0 이면 전부 종료. */
async function pendingMatchCount(date: string): Promise<number> {
  const { gte, lt } = kstRange(date);
  const ms = await prisma.match.findMany({
    where: { league: "WORLD_CUP", startTime: { gte, lt } },
    select: { status: true },
  });
  return ms.filter(
    (m) => m.status !== "FINISHED" && m.status !== "POSTPONED" && m.status !== "CANCELLED",
  ).length;
}

async function collectStats(date: string): Promise<Map<string, RawStatRow>> {
  const { gte, lt } = kstRange(date);
  const ms = await prisma.match.findMany({
    where: { league: "WORLD_CUP", status: "FINISHED", startTime: { gte, lt } },
    select: { theSportsCache: { select: { playerStats: true } } },
  });
  const map = new Map<string, RawStatRow>();
  for (const m of ms) {
    const ps = m.theSportsCache?.playerStats as RawStatRow[] | null;
    if (!Array.isArray(ps)) continue;
    for (const s of ps) {
      if (!s?.player_id) continue;
      const prev = map.get(s.player_id);
      if (!prev || (s.rating ?? 0) > (prev.rating ?? 0)) map.set(s.player_id, s);
    }
  }
  return map;
}

export async function runTeamOfDayArticle() {
  console.log("[tod-article] 시작");
  const tod = await getTeamOfDay();
  if (!tod) {
    console.log("[tod-article] 완료 경기 없음 — skip");
    return;
  }
  if (tod.xi.length < 7) {
    console.log(`[tod-article] 베스트11 ${tod.xi.length}명뿐 — skip`);
    return;
  }

  const slug = `${TOD_ARTICLE_SLUG_PREFIX}${tod.date}`;
  const existing = await prisma.article.findUnique({ where: { slug } });
  if (existing) {
    console.log(`[tod-article] ${tod.date} 글 이미 있음 (#${existing.id}) — skip`);
    return;
  }

  // 그날 모든 경기가 끝나기 전엔 베스트11 이 불완전하므로 발행 보류 (cron 다음 tick 재시도).
  const pending = await pendingMatchCount(tod.date);
  if (pending > 0) {
    console.log(`[tod-article] ${tod.date} 아직 ${pending}경기 진행/예정 — 전 경기 종료 후 발행`);
    return;
  }

  const statMap = await collectStats(tod.date);
  const toAnalysis = (p: TodPlayer): TodAnalysisPlayer => ({
    name: p.name,
    countryKo: p.countryKo,
    flag: p.flag,
    pos: p.pos,
    rating: p.rating,
    captain: p.captain,
    goals: p.goals,
    assists: p.assists,
    stats: statMap.get(p.id) ?? null,
  });
  const xi = tod.xi.map(toAnalysis).sort((a, b) => b.rating - a.rating);
  const bench = tod.bench.map(toAnalysis).sort((a, b) => b.rating - a.rating);

  const [, mm, dd] = tod.date.split("-");
  const dateKo = `${Number(mm)}월 ${Number(dd)}일`;

  const prompt = buildTeamOfDayAnalysisPrompt({
    date: tod.date,
    dateKo,
    matchCount: tod.matchCount,
    matches: tod.matches,
    xi,
    bench,
    topRating: tod.topRating,
  });

  const content = await generateWithMinLength(prompt, {
    system: SYSTEM_PROMPT,
    maxTokens: 4096,
    temperature: 0.6,
    label: "tod-article",
  });
  if (!content) {
    console.log("[tod-article] 본문 길이 미달 — skip");
    return;
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
    `[tod-article] ✅ #${article.id} ${title} (${content.length}자) → /articles/${slug}`,
  );

  // SNS 카드(피치 이미지) + 캡션을 텔레그램으로 — 인스타·스레드 수동 게시용.
  try {
    const mvp = xi[0];
    const caption = buildTeamOfDayCaption({
      dateLabel: dateKo,
      url: `${SITE_URL}/articles/${slug}`,
      mvpName: mvp.name,
      mvpCountry: mvp.countryKo,
      mvpRating: mvp.rating,
      results: tod.matches,
    });
    await sendTelegramPhoto(`${SITE_URL}/api/og/team-of-day?date=${tod.date}`, caption);
    console.log("[tod-article] 텔레그램 SNS 카드 전송 완료");
  } catch (e) {
    console.warn("[tod-article] 텔레그램 전송 실패:", (e as Error).message);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runTeamOfDayArticle()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
