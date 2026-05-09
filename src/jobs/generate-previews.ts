// AI 프리뷰 글 생성 잡 (분석가급).
// 사용: npm run job:preview

import "@/lib/env";
import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/gemini";
import { SYSTEM_PROMPT } from "@/prompts/system";
import { buildPreviewPrompt } from "@/prompts/match-preview";
import { notifyDraftReady } from "@/lib/notify/telegram";
import {
  buildMatchContext,
  enrichContextWithApiFootball,
} from "@/lib/predict/build-context";
import type { League, MatchStatus, NormalizedMatch } from "@/lib/sports/types";
import type { PredictMatch } from "@/lib/predict/types";

function extractTitle(markdown: string): string {
  const m = markdown.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : "프리뷰";
}

function buildSlug(league: string, matchId: number): string {
  return `${league.toLowerCase()}-preview-${matchId}`;
}

export async function runPreview(opts?: { autoPublish?: boolean }) {
  const autoPublish = opts?.autoPublish ?? true;
  console.log(`[preview] 시작 — autoPublish=${autoPublish}`);

  const now = new Date();
  // 다음 14일 SCHEDULED 매치까지 커버 (이전 7일 → 확장)
  const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const matches = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      startTime: { gte: now, lte: horizon },
      articles: { none: { type: "PREVIEW" } },
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { startTime: "asc" },
    take: 40, // 한 번 실행 시 최대 40건 처리
  });

  console.log(`[preview] 대상: ${matches.length}경기`);
  if (matches.length === 0) {
    await prisma.$disconnect();
    return;
  }

  const leagues = [...new Set(matches.map((m) => m.league))];
  const leagueMatches: Record<string, PredictMatch[]> = {};
  for (const lg of leagues) {
    const list = await prisma.match.findMany({
      where: { league: lg },
      select: {
        id: true,
        league: true,
        status: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
        startTime: true,
      },
    });
    leagueMatches[lg] = list as PredictMatch[];
  }

  for (const m of matches) {
    try {
      let context = buildMatchContext(
        leagueMatches[m.league],
        m.league,
        m.homeTeamId,
        m.awayTeamId,
        m.startTime,
      );
      context = await enrichContextWithApiFootball(
        context,
        m.league,
        m.homeTeam.name,
        m.awayTeam.name,
        m.startTime,
      );

      const normalized: NormalizedMatch = {
        league: m.league as League,
        externalId: m.externalId,
        homeTeam: {
          externalId: m.homeTeam.externalId,
          name: m.homeTeam.name,
          logoUrl: m.homeTeam.logoUrl ?? undefined,
        },
        awayTeam: {
          externalId: m.awayTeam.externalId,
          name: m.awayTeam.name,
          logoUrl: m.awayTeam.logoUrl ?? undefined,
        },
        status: m.status as MatchStatus,
        startTime: m.startTime,
        raw: {},
      };

      const content = await generate(
        buildPreviewPrompt({ match: normalized, context }),
        { system: SYSTEM_PROMPT, maxTokens: 2500, temperature: 0.6 },
      );

      const title = extractTitle(content);
      const slug = buildSlug(m.league, m.id);

      const article = await prisma.article.create({
        data: {
          matchId: m.id,
          type: "PREVIEW",
          league: m.league,
          title,
          slug,
          content,
          status: autoPublish ? "PUBLISHED" : "PENDING_REVIEW",
          publishedAt: autoPublish ? new Date() : null,
        },
      });

      console.log(
        `[preview] ✅ #${article.id} ${m.league} ${m.homeTeam.name} vs ${m.awayTeam.name}: ${title}`,
      );

      await notifyDraftReady({
        id: article.id,
        title: article.title,
        league: article.league,
        type: article.type,
      });
    } catch (err) {
      console.error(
        `[preview] 실패 (match #${m.id}):`,
        (err as Error).message,
      );
    }
  }

  console.log("[preview] 완료");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPreview()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
