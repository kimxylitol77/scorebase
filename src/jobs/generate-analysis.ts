// 리그별 시즌 종합 분석 글 자동 생성.
// 같은 주(week) 안에 같은 리그·ANALYSIS 글이 이미 있으면 스킵.
//
// 사용: npm run job:analysis

import "@/lib/env";
import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/claude";
import { SYSTEM_PROMPT } from "@/prompts/system";
import { buildSeasonAnalysisPrompt } from "@/prompts/season-analysis";
import { buildWorldCupAnalysisPrompt } from "@/prompts/world-cup-analysis";
import { buildSeasonContext } from "@/lib/predict/season-context";
import { simulateWorldCup } from "@/lib/predict/world-cup-simulation";
import type { PredictMatch } from "@/lib/predict/types";

const RELEGATION_BY_LEAGUE: Record<string, number> = {
  EPL: 3,
  LALIGA: 3,
  BUNDESLIGA: 3,
  SERIE_A: 3,
  LIGUE_1: 2,
  MLS: 0,
  UCL: 0,
  NBA: 0,
  NHL: 0,
  MLB: 0,
  KBO: 0,
  NPB: 0,
  LOL: 0,
  K_LEAGUE_1: 2,
  K_LEAGUE_2: 2,
  J1_LEAGUE: 3,
  J2_LEAGUE: 3,
  AFC_CL: 0,
  SAUDI_PL: 2,
  UEL: 0,
  UECL: 0,
  CHAMPIONSHIP: 3,
  LALIGA_2: 4,
  BUNDESLIGA_2: 3,
  SERIE_B: 3,
  LIGUE_2: 2,
  CLUB_WORLD_CUP: 0,
  AFC_CL_TWO: 0,
  AFC_U23: 0,
  CSL: 2,
  A_LEAGUE: 1,
  EREDIVISIE: 1,
  PRIMEIRA_LIGA: 2,
  SUPER_LIG: 4,
  JUPILER_PL: 0,
  SPL: 2,
  GREEK_SL: 2,
  BRASILEIRAO: 4,
  LIGA_MX: 0,
  COPA_LIB: 0,
  COPA_SUD: 0,
};

function extractTitle(md: string): string {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : "시즌 분석";
}

function buildSlug(league: string, articleId: number): string {
  return `${league.toLowerCase()}-analysis-${articleId}`;
}

function isoWeek(d: Date): string {
  // 같은 ISO 주 안에 한 번만 — yyyy-Www 형식
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function runAnalysis() {
  console.log("[analysis] 시작");
  const leagues = [
    "WORLD_CUP",
    "EPL",
    "LALIGA",
    "BUNDESLIGA",
    "SERIE_A",
    "LIGUE_1",
    "MLS",
    "UCL",
    "K_LEAGUE_1",
    "J1_LEAGUE",
    "AFC_CL",
    "NBA",
    "NHL",
    "MLB",
    "KBO",
    "NPB",
    "LOL",
  ] as const;
  const thisWeek = isoWeek(new Date());

  for (const league of leagues) {
    try {
      // 이번 주 ANALYSIS 글이 이미 있으면 스킵
      const weekStart = new Date();
      weekStart.setUTCDate(weekStart.getUTCDate() - 7);
      const existing = await prisma.article.findFirst({
        where: {
          league,
          type: "ANALYSIS",
          createdAt: { gte: weekStart },
        },
      });
      if (existing) {
        console.log(
          `[analysis] ${league} 이번 주 글 #${existing.id} 이미 있음 (${existing.title.slice(0, 30)}…) — 스킵`,
        );
        continue;
      }

      let prompt: string;

      if (league === "WORLD_CUP") {
        // 월드컵은 외부 시드 Elo 기반 토너먼트 시뮬 결과로 분석.
        // (클럽 매치 데이터 없으니 일반 시즌 분석 경로 안 탐)
        const teams = await prisma.team.findMany({
          where: { league: "WORLD_CUP" },
        });
        if (teams.length < 32) {
          console.log(
            `[analysis] WORLD_CUP 팀 수 ${teams.length} 부족 — 스킵`,
          );
          continue;
        }
        const teamMap = new Map(teams.map((t) => [t.id, t.name]));
        const wcResults = simulateWorldCup(teamMap, 5000);
        prompt = buildWorldCupAnalysisPrompt({
          results: wcResults,
          iterations: 5000,
        });
      } else {
        const dbMatches = await prisma.match.findMany({
          where: { league },
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
        const matches = dbMatches as PredictMatch[];

        const finishedCount = matches.filter((m) => m.status === "FINISHED").length;
        if (finishedCount < 30) {
          console.log(
            `[analysis] ${league} 데이터 부족 (FINISHED ${finishedCount}경기) — 스킵`,
          );
          continue;
        }

        const teams = await prisma.team.findMany({ where: { league } });
        const nameById = new Map(teams.map((t) => [t.id, t.name]));

        const context = buildSeasonContext(matches, league, {
          relegationCount: RELEGATION_BY_LEAGUE[league] ?? 0,
          iterations: 3000,
        });

        prompt = buildSeasonAnalysisPrompt({
          context,
          teamName: (id) => nameById.get(id) ?? `팀 ${id}`,
        });
      }

      const content = await generate(prompt, {
        system: SYSTEM_PROMPT,
        maxTokens: 3000,
        temperature: 0.65,
      });

      const title = extractTitle(content);

      // 임시 slug 로 만든 후 ID 기반 slug 로 update
      const tempSlug = `tmp-analysis-${Date.now()}-${league}-${Math.random().toString(36).slice(2, 6)}`;
      const article = await prisma.article.create({
        data: {
          type: "ANALYSIS",
          league,
          title,
          slug: tempSlug,
          content,
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });
      const finalSlug = buildSlug(league, article.id);
      await prisma.article.update({
        where: { id: article.id },
        data: { slug: finalSlug },
      });

      console.log(
        `[analysis] ✅ ${league} #${article.id} ${title} (${content.length}자, ${thisWeek})`,
      );

      // 호출 사이 간격 (분당 한도 안전)
      await new Promise((r) => setTimeout(r, 5000));
    } catch (e) {
      console.error(
        `[analysis] ${league} 실패:`,
        (e as Error).message?.slice(0, 100),
      );
    }
  }

  console.log("[analysis] 완료");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAnalysis()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
