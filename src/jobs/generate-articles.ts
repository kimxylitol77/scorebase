// AI RECAP 글 생성 잡 (분석가급).
// 사용: npm run job:generate

import "@/lib/env";
import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/gemini";
import { SYSTEM_PROMPT } from "@/prompts/system";
import { buildRecapPrompt } from "@/prompts/match-recap";
import { notifyDraftReady } from "@/lib/notify/telegram";
import { titleDatePrefixKST } from "@/lib/format";
import {
  buildMatchContext,
  enrichContextWithApiFootball,
  enrichRecapWithApiFootball,
} from "@/lib/predict/build-context";
import type { League, MatchStatus, NormalizedMatch } from "@/lib/sports/types";
import type { PredictMatch } from "@/lib/predict/types";

function buildSlug(league: string, matchId: number): string {
  return `${league.toLowerCase()}-recap-${matchId}`;
}

function extractTitle(markdown: string): string {
  const m = markdown.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : "제목 미상";
}

export async function runRecap(opts?: {
  sinceHours?: number;
  league?: string;
  take?: number;
  autoPublish?: boolean;
}) {
  const sinceHours = opts?.sinceHours ?? 36;
  const take = opts?.take ?? 20;
  const onlyLeague = opts?.league;
  const autoPublish = opts?.autoPublish ?? true;
  console.log(
    `[generate] 시작 — sinceHours=${sinceHours}, league=${onlyLeague ?? "ALL"}, take=${take}, autoPublish=${autoPublish}`,
  );

  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
  const matches = await prisma.match.findMany({
    where: {
      status: "FINISHED",
      startTime: { gte: since },
      articles: { none: { type: "RECAP" } },
      ...(onlyLeague ? { league: onlyLeague } : {}),
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { startTime: "desc" },
    take,
  });

  console.log(`[generate] 대상 경기: ${matches.length}개`);
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
      // RECAP 추가: 실제 라인업·골 시간·카드
      context = await enrichRecapWithApiFootball(
        context,
        m.league,
        m.homeTeamId,
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
        homeScore: m.homeScore ?? undefined,
        awayScore: m.awayScore ?? undefined,
        status: m.status as MatchStatus,
        startTime: m.startTime,
        raw: m.raw ? JSON.parse(m.raw) : undefined,
      };

      const content = await generate(
        buildRecapPrompt({ match: normalized, context }),
        { system: SYSTEM_PROMPT, maxTokens: 2500, temperature: 0.6 },
      );

      const rawTitle = extractTitle(content);
      const prefix = titleDatePrefixKST(m.startTime);
      const title = rawTitle.startsWith("[")
        ? rawTitle
        : `${prefix} ${rawTitle}`;
      const slug = buildSlug(m.league, m.id);

      const article = await prisma.article.create({
        data: {
          matchId: m.id,
          type: "RECAP",
          league: m.league,
          title,
          slug,
          content,
          status: autoPublish ? "PUBLISHED" : "PENDING_REVIEW",
          publishedAt: autoPublish ? new Date() : null,
        },
      });

      console.log(`[generate] ✅ ${article.league} 글 #${article.id}: ${title}`);
      await notifyDraftReady({
        id: article.id,
        title: article.title,
        league: article.league,
        type: article.type,
      });
    } catch (err) {
      console.error(
        `[generate] 실패 (match #${m.id}):`,
        (err as Error).message,
      );
    }
  }

  console.log("[generate] 완료");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runRecap()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
