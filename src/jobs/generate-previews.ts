// AI 프리뷰 글 생성 잡 (분석가급).
// 사용: npm run job:preview

import "@/lib/env";
import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/openai";
import { SYSTEM_PROMPT } from "@/prompts/system";
import { buildPreviewPrompt } from "@/prompts/match-preview";
import { buildLolPreviewPrompt } from "@/prompts/lol-preview";
import { fetchCurrentLolPatch, calcLckStandings } from "@/lib/sports/lol";
import {
  fetchLckRoster,
  fetchPlayerSeasonStats,
  lpTeamNameByExternalId,
} from "@/lib/sports/leaguepedia";
import type {
  LolRosterPlayer,
  LolPlayerStatsLite,
} from "@/prompts/match-preview";
import { notifyDraftReady } from "@/lib/notify/telegram";
import { titleDatePrefixKST } from "@/lib/format";
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

export async function runPreview(opts?: {
  autoPublish?: boolean;
  league?: string;
  /** 기본 3일. 더 좁히고 싶을 때 1·2일 등 직접 지정 가능. */
  horizonDays?: number;
  take?: number;
}) {
  const autoPublish = opts?.autoPublish ?? true;
  const onlyLeague = opts?.league;
  const horizonDays = opts?.horizonDays ?? 3;
  const take = opts?.take ?? 40;
  console.log(
    `[preview] 시작 — autoPublish=${autoPublish}, league=${onlyLeague ?? "ALL"}, horizon=${horizonDays}d, take=${take}`,
  );

  const now = new Date();
  // 라인업/폼 변동이 큰 먼 미래 매치는 모델 신뢰도가 떨어지므로 의도적으로 좁게.
  const horizon = new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000);

  const matches = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      startTime: { gte: now, lte: horizon },
      articles: { none: { type: "PREVIEW" } },
      ...(onlyLeague ? { league: onlyLeague } : {}),
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { startTime: "asc" },
    take,
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

      // 시장 odds 가 저장돼 있으면 context 에 주입 → 프롬프트에서 Value Bet 자동 강조
      if (m.marketHome != null && m.marketAway != null) {
        context.marketProb = {
          home: m.marketHome,
          draw: m.marketDraw ?? 0,
          away: m.marketAway,
          bookmakers: m.marketBookmakers ?? 0,
        };
      }

      // 베팅 라인 움직임 (오프닝 vs 현재) — 둘 다 있을 때만
      if (
        m.openingMarketHome != null &&
        m.openingMarketAway != null &&
        m.marketHome != null &&
        m.marketAway != null
      ) {
        context.lineMovement = {
          home: { opening: m.openingMarketHome, current: m.marketHome },
          draw: {
            opening: m.openingMarketDraw ?? 0,
            current: m.marketDraw ?? 0,
          },
          away: { opening: m.openingMarketAway, current: m.marketAway },
          capturedAt: m.openingCapturedAt ?? undefined,
        };
      }

      // 라인업 (api-football Pro)
      if (m.lineupHome && m.lineupAway) {
        try {
          context.lineups = {
            home: JSON.parse(m.lineupHome),
            away: JSON.parse(m.lineupAway),
          };
        } catch {}
      }

      // API-Football 자체 prediction (third opinion)
      if (m.apiPredHome != null && m.apiPredAway != null) {
        context.apiPrediction = {
          homePct: m.apiPredHome,
          drawPct: m.apiPredDraw ?? 0,
          awayPct: m.apiPredAway,
          advice: m.apiPredAdvice ?? undefined,
        };
      }

      // MLB 선발 투수 (statsapi.mlb.com)
      if (m.league === "MLB" && (m.homeStarter || m.awayStarter)) {
        try {
          context.starters = {
            home: m.homeStarter ? JSON.parse(m.homeStarter) : undefined,
            away: m.awayStarter ? JSON.parse(m.awayStarter) : undefined,
          };
        } catch {}
      }

      // NHL 골리 (api-web.nhle.com)
      if (m.league === "NHL" && (m.homeGoalie || m.awayGoalie)) {
        try {
          context.goalies = {
            home: m.homeGoalie ? JSON.parse(m.homeGoalie) : undefined,
            away: m.awayGoalie ? JSON.parse(m.awayGoalie) : undefined,
          };
        } catch {}
      }

      // LoL — 현재 패치 + LCK 정규 standings + Leaguepedia roster/stats + 게임 수 모델
      if (m.league === "LOL") {
        const patch = await fetchCurrentLolPatch();
        const lckMatches = leagueMatches[m.league] ?? [];
        const standings = calcLckStandings(lckMatches);
        const homeStanding = standings.get(m.homeTeamId);
        const awayStanding = standings.get(m.awayTeamId);

        // Bo3 게임 수 OVER/UNDER 2.5 — LCK 정규시즌 매치 결과 풀세트(3게임) 빈도
        let gameCountMarket: NonNullable<typeof context.lolMeta>["gameCountMarket"] | undefined;
        const fin = lckMatches.filter(
          (x) =>
            x.status === "FINISHED" &&
            x.homeScore !== null &&
            x.awayScore !== null,
        );
        if (fin.length >= 10) {
          const fullSets = fin.filter(
            (x) => (x.homeScore ?? 0) + (x.awayScore ?? 0) >= 3,
          ).length;
          gameCountMarket = {
            line: 2.5,
            pOver: fullSets / fin.length,
            sample: fin.length,
          };
        }

        // Leaguepedia 로스터 + 선수 KDA — graceful fail (rate limit / 네트워크 실패 시 단락 생략)
        let rosters: NonNullable<typeof context.lolMeta>["rosters"] | undefined;
        let playerStats: Record<string, LolPlayerStatsLite> | undefined;
        try {
          const hLpName = lpTeamNameByExternalId(m.homeTeam.externalId);
          const aLpName = lpTeamNameByExternalId(m.awayTeam.externalId);
          if (hLpName && aLpName) {
            const [hRoster, aRoster] = await Promise.all([
              fetchLckRoster(hLpName),
              fetchLckRoster(aLpName),
            ]);
            const toPrompt = (r: typeof hRoster): LolRosterPlayer[] =>
              r.map((p) => ({
                id: p.id,
                nameEn: p.name,
                nameKo: p.nameKo,
                role: p.role,
                country: p.country,
              }));
            rosters = { home: toPrompt(hRoster), away: toPrompt(aRoster) };

            // 선수 통계 — 호출 비용 큼. 양 팀 모두 10명 fetch 는 rate limit 위험.
            // 일단 미드(라인 임팩트 큼) 양 팀만 시도 — 실패해도 graceful.
            const homeMid = hRoster.find((p) => p.role === "Mid");
            const awayMid = aRoster.find((p) => p.role === "Mid");
            const stats: Record<string, LolPlayerStatsLite> = {};
            const seasonLike = "LCK 2026%";
            for (const p of [homeMid, awayMid].filter(Boolean) as typeof hRoster) {
              try {
                await new Promise((r) => setTimeout(r, 1500)); // 호출 간 sleep — rate limit 회피
                const s = await fetchPlayerSeasonStats(p.id, seasonLike);
                if (s)
                  stats[p.id] = {
                    games: s.games,
                    kda: s.kda,
                    topChampions: s.topChampions,
                  };
              } catch {
                // 한 명 실패해도 나머지 진행
              }
            }
            if (Object.keys(stats).length > 0) playerStats = stats;
          }
        } catch (err) {
          console.warn(
            `[preview/LOL] Leaguepedia fetch 실패 — 단락 생략으로 진행:`,
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
          gameCountMarket,
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
        status: m.status as MatchStatus,
        startTime: m.startTime,
        raw: {},
      };

      const prompt =
        m.league === "LOL"
          ? buildLolPreviewPrompt({ match: normalized, context })
          : buildPreviewPrompt({ match: normalized, context });
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

      // 적중률 추적용 — 글 작성 시점의 추정 승률을 그대로 저장
      const wp = context.winProb;
      const predictedWinner = wp
        ? wp.home >= wp.away && wp.home >= wp.draw
          ? "HOME"
          : wp.away >= wp.draw
            ? "AWAY"
            : "DRAW"
        : null;

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
          predHome: wp?.home ?? null,
          predDraw: wp?.draw ?? null,
          predAway: wp?.away ?? null,
          predWinner: predictedWinner,
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
