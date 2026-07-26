// 리그별 시즌 종합 분석 글 자동 생성.
// 같은 주(week) 안에 같은 리그·ANALYSIS 글이 이미 있으면 스킵.
//
// 사용: npm run job:analysis

import "@/lib/env";
import { prisma } from "@/lib/db";
import { generateWithMinLength } from "@/lib/ai/generate-with-min-length";
import { SYSTEM_PROMPT } from "@/prompts/system";
import { buildSeasonAnalysisPrompt } from "@/prompts/season-analysis";
import { buildWorldCupAnalysisPrompt } from "@/prompts/world-cup-analysis";
import { buildSeasonContext } from "@/lib/predict/season-context";
import { simulateWorldCup } from "@/lib/predict/world-cup-simulation";
import type { PredictMatch } from "@/lib/predict/types";
import { toKoreanTeamName } from "@/lib/team-names";
import { buildAbsChallengeSection } from "@/lib/sports/mlb-abs-challenges";

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
      // 최근 60시간 내 같은 리그 ANALYSIS 있으면 스킵 — 주 2회 운영(월 11시 맥미니 +
      // 목 11시 Vercel)용. 간격이 정확히 72h 라 3일(72h) 가드는 경계에서 막혀 60h 로.
      // ANALYSIS 는 유일하게 색인되는 글 타입 — 양산 방지 가드는 유지한다.
      const freshSince = new Date(Date.now() - 60 * 60 * 60 * 1000);
      const existing = await prisma.article.findFirst({
        where: {
          league,
          type: "ANALYSIS",
          createdAt: { gte: freshSince },
        },
      });
      if (existing) {
        console.log(
          `[analysis] ${league} 최근 60h 내 글 #${existing.id} 이미 있음 (${existing.title.slice(0, 30)}…) — 스킵`,
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

        // 비시즌 게이트 — 마지막 종료 경기가 14일+ 과거이고 3주 내 예정 경기도 없으면
        // 시즌 종료로 판단하고 스킵. 최종 순위표를 "진행 중"으로 해석한 오류 글이
        // 유럽 3리그 비시즌 동안 13편 자동 발행된 실측(2026-07-18) 재발 방지.
        // 시즌 개막 직전(직전 시즌 종료 오래됐어도 예정 경기 있음)과 겨울 휴식기는 통과한다.
        const now = Date.now();
        const lastFinishedAt = dbMatches
          .filter((m) => m.status === "FINISHED")
          .reduce((max, m) => Math.max(max, m.startTime.getTime()), 0);
        const hasUpcoming = dbMatches.some(
          (m) => m.status === "SCHEDULED" && m.startTime.getTime() > now && m.startTime.getTime() < now + 21 * 86400_000,
        );
        if (now - lastFinishedAt > 14 * 86400_000 && !hasUpcoming) {
          console.log(`[analysis] ${league} 비시즌(마지막 경기 ${Math.round((now - lastFinishedAt) / 86400_000)}일 전, 예정 없음) — 스킵`);
          continue;
        }

        const teams = await prisma.team.findMany({ where: { league } });
        // 팀명은 한글로 주입 — 영문을 주면 모델이 스스로 음역하다 "아르센알" 류 오염(실측).
        const nameById = new Map(teams.map((t) => [t.id, toKoreanTeamName(t.name, league) || t.name]));

        const context = buildSeasonContext(matches, league, {
          relegationCount: RELEGATION_BY_LEAGUE[league] ?? 0,
          iterations: 3000,
        });

        prompt = buildSeasonAnalysisPrompt({
          context,
          teamName: (id) => nameById.get(id) ?? `팀 ${id}`,
        });
      }

      let content = await generateWithMinLength(prompt, {
        system: SYSTEM_PROMPT,
        maxTokens: 3000,
        temperature: 0.65,
        label: `analysis ${league}`,
      });
      if (!content) continue; // 길이 미달 — DB INSERT 스킵

      // MLB 한정: ABS 챌린지 리더보드 섹션을 코드가 결정적으로 덧붙임 (LLM 수치 오염 차단).
      // Savant 비공식 endpoint 실패 시 섹션만 생략하고 발행은 계속.
      if (league === "MLB") {
        const abs = await buildAbsChallengeSection(new Date().getFullYear());
        if (abs) content = `${content}\n\n${abs}`;
        else console.warn("[analysis] MLB ABS 섹션 생략 (Savant 응답 실패)");
      }

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
