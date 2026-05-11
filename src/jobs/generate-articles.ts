// AI RECAP 글 생성 잡 (분석가급).
// 사용: npm run job:generate

import "@/lib/env";
import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/openai";
import { SYSTEM_PROMPT } from "@/prompts/system";
import { buildRecapPrompt, type RecapContext } from "@/prompts/match-recap";
import { buildLolRecapPrompt } from "@/prompts/lol-recap";
import {
  fetchCurrentLolPatch,
  calcLckStandings,
  discoverTeamRoster,
  fetchBdlPlayerStats,
} from "@/lib/sports/lol";
import type {
  LolRosterPlayer,
  LolPlayerStatsLite,
} from "@/prompts/match-preview";
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

      // LoL — patch + standings + rosters/playerStats + predCorrect 결과 주입
      if (m.league === "LOL") {
        const patch = await fetchCurrentLolPatch();
        const lckMatches = leagueMatches[m.league] ?? [];
        const standings = calcLckStandings(lckMatches);
        const homeStanding = standings.get(m.homeTeamId);
        const awayStanding = standings.get(m.awayTeamId);

        const homeBdlId = Number(m.homeTeam.externalId);
        const awayBdlId = Number(m.awayTeam.externalId);

        const recentHomeMatches = await prisma.match.findMany({
          where: {
            league: "LOL",
            status: "FINISHED",
            OR: [
              { homeTeamId: m.homeTeamId },
              { awayTeamId: m.homeTeamId },
            ],
          },
          orderBy: { startTime: "desc" },
          take: 5,
          select: { externalId: true },
        });
        const recentAwayMatches = await prisma.match.findMany({
          where: {
            league: "LOL",
            status: "FINISHED",
            OR: [
              { homeTeamId: m.awayTeamId },
              { awayTeamId: m.awayTeamId },
            ],
          },
          orderBy: { startTime: "desc" },
          take: 5,
          select: { externalId: true },
        });

        let rosters: NonNullable<typeof context.lolMeta>["rosters"] | undefined;
        let playerStats: Record<string, LolPlayerStatsLite> | undefined;
        try {
          const [hDisc, aDisc] = await Promise.all([
            recentHomeMatches.length
              ? discoverTeamRoster(homeBdlId, recentHomeMatches.map((x) => x.externalId))
              : Promise.resolve([]),
            recentAwayMatches.length
              ? discoverTeamRoster(awayBdlId, recentAwayMatches.map((x) => x.externalId))
              : Promise.resolve([]),
          ]);
          const normRole = (r: string): string => {
            const lo = r.toLowerCase();
            if (lo === "top") return "Top";
            if (lo.startsWith("jun") || lo === "jungle" || lo === "jg") return "Jungle";
            if (lo === "mid" || lo === "middle") return "Mid";
            if (lo === "adc" || lo === "bot" || lo === "ad carry") return "Bot";
            if (lo.startsWith("sup")) return "Support";
            return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
          };
          const toRoster = (disc: typeof hDisc): LolRosterPlayer[] =>
            disc.map((p) => ({
              id: p.nickname,
              bdlId: p.id,
              nameEn: p.nameEn,
              role: normRole(p.role),
              country: p.country,
              recentChampions: p.recentChampions,
            }));
          const hRoster = toRoster(hDisc);
          const aRoster = toRoster(aDisc);
          if (hRoster.length > 0 || aRoster.length > 0) {
            rosters = { home: hRoster, away: aRoster };
          }
          // 미드 stats 만
          const homeMid = hRoster.find((p) => p.role === "Mid");
          const awayMid = aRoster.find((p) => p.role === "Mid");
          const stats: Record<string, LolPlayerStatsLite> = {};
          for (const p of [homeMid, awayMid].filter(Boolean) as LolRosterPlayer[]) {
            if (!p.bdlId) continue;
            const games = await fetchBdlPlayerStats(p.bdlId, 30);
            if (games.length === 0) continue;
            let k = 0, d = 0, a = 0, cs = 0, dmg = 0, gpm = 0;
            const champCount = new Map<string, number>();
            for (const g of games) {
              k += g.kills || 0;
              d += g.deaths || 0;
              a += g.assists || 0;
              cs += g.creep_score ?? 0;
              dmg += g.total_damage_dealt_to_champions ?? 0;
              gpm += g.gold_per_min ?? 0;
              if (g.champion)
                champCount.set(
                  g.champion.name,
                  (champCount.get(g.champion.name) ?? 0) + 1,
                );
            }
            stats[p.id] = {
              games: games.length,
              kda: d === 0 ? k + a : (k + a) / d,
              avgCs: games.length ? cs / games.length : undefined,
              avgDpm: games.length ? dmg / games.length : undefined,
              avgGpm: games.length ? gpm / games.length : undefined,
              topChampions: [...champCount.entries()]
                .sort((x, y) => y[1] - x[1])
                .slice(0, 3)
                .map(([champion, games]) => ({ champion, games })),
            };
          }
          if (Object.keys(stats).length > 0) playerStats = stats;
        } catch (err) {
          console.warn(
            `[recap/LOL] BDL roster/stats 실패 — 단락 생략:`,
            (err as Error).message,
          );
        }

        context.lolMeta = {
          patch: patch ?? undefined,
          standings:
            homeStanding && awayStanding
              ? {
                  home: {
                    rank: homeStanding.rank,
                    wins: homeStanding.wins,
                    losses: homeStanding.losses,
                    setsWon: homeStanding.setsWon,
                    setsLost: homeStanding.setsLost,
                  },
                  away: {
                    rank: awayStanding.rank,
                    wins: awayStanding.wins,
                    losses: awayStanding.losses,
                    setsWon: awayStanding.setsWon,
                    setsLost: awayStanding.setsLost,
                  },
                  total: standings.size,
                }
              : undefined,
          rosters,
          playerStats,
          recap: {
            predWinner: m.predWinner ?? undefined,
            predCorrect: m.predCorrect ?? undefined,
          },
        };
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

      const prompt =
        m.league === "LOL"
          ? buildLolRecapPrompt({ match: normalized, context })
          : buildRecapPrompt({ match: normalized, context });
      const content = await generate(prompt, {
        system: SYSTEM_PROMPT,
        maxTokens: 2500,
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
