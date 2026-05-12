// AI RECAP 글 생성 잡 (분석가급).
// 사용: npm run job:generate

import "@/lib/env";
import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/claude";
import { SYSTEM_PROMPT } from "@/prompts/system";
import { buildRecapPrompt, type RecapContext } from "@/prompts/match-recap";
import { buildLolRecapPromptV2 } from "@/prompts/lol-recap";
import { buildLolRecapContext } from "@/lib/sports/lol-recap-context";
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

      // 매치 시점 시장 odds 가 저장돼 있으면 RECAP 에서 "시장 예측 vs 실제 결과" 비교
      if (m.marketHome != null && m.marketAway != null) {
        context.marketProb = {
          home: m.marketHome,
          draw: m.marketDraw ?? 0,
          away: m.marketAway,
          bookmakers: m.marketBookmakers ?? 0,
        };
      }

      // API-Football fixture statistics (RECAP 강화)
      if (m.fixtureStats) {
        try {
          (context as RecapContext).fixtureStats = JSON.parse(m.fixtureStats);
        } catch {}
      }
      if (m.lineupHome && m.lineupAway && !context.lineups) {
        try {
          context.lineups = {
            home: JSON.parse(m.lineupHome),
            away: JSON.parse(m.lineupAway),
          };
        } catch {}
      }

      // LoL RECAP — buildLolRecapContext 가 BDL match_maps → player/team stats →
      // MVP/LVP · 타임라인 · Quote · 시즌 누적 · 다음 매치 · 슈퍼스타 매핑까지 통합 처리.
      let lolRecapCtx: Awaited<ReturnType<typeof buildLolRecapContext>> | null = null;
      if (m.league === "LOL") {
        try {
          lolRecapCtx = await buildLolRecapContext({
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
        } catch (err) {
          console.warn(
            `[recap/LOL] context 빌드 실패:`,
            (err as Error).message,
          );
        }
      }

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

      // 본문 내부 링크 1개용 — 양 팀 중 한 쪽의 다음 SCHEDULED 매치에 발행된 PREVIEW 글.
      // LoL 은 lolRecapCtx 안에 nextMatch.previewSlug 가 이미 들어가 있으므로, 일반 종목에만 채움.
      if (m.league !== "LOL") {
        try {
          const horizon = new Date(Date.now() + 30 * 24 * 3600 * 1000);
          const upcoming = await prisma.match.findFirst({
            where: {
              league: m.league,
              status: "SCHEDULED",
              startTime: { gte: m.startTime, lte: horizon },
              OR: [
                { homeTeamId: m.homeTeamId },
                { awayTeamId: m.homeTeamId },
                { homeTeamId: m.awayTeamId },
                { awayTeamId: m.awayTeamId },
              ],
              articles: { some: { type: "PREVIEW", status: "PUBLISHED" } },
            },
            orderBy: { startTime: "asc" },
            select: {
              homeTeamId: true,
              awayTeamId: true,
              articles: {
                where: { type: "PREVIEW", status: "PUBLISHED" },
                select: { slug: true, title: true },
                take: 1,
              },
            },
          });
          if (upcoming?.articles[0]) {
            const sameTeam =
              upcoming.homeTeamId === m.homeTeamId || upcoming.awayTeamId === m.homeTeamId;
            (context as RecapContext).nextMatchPreview = {
              slug: upcoming.articles[0].slug,
              title: upcoming.articles[0].title,
              teamSide: sameTeam ? "home" : "away",
            };
          }
        } catch (err) {
          console.warn(`[recap] nextMatchPreview fetch 실패:`, (err as Error).message);
        }
      }

      const prompt =
        m.league === "LOL" && lolRecapCtx
          ? buildLolRecapPromptV2(lolRecapCtx)
          : buildRecapPrompt({ match: normalized, context });
      const content = await generate(prompt, {
        system: SYSTEM_PROMPT,
        maxTokens: 4096,
        temperature: 0.6,
      });

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
          // LoL RECAP — UI 카드 렌더링용 JSON 컨텍스트 저장
          lolContext: lolRecapCtx ? JSON.stringify(lolRecapCtx) : null,
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
