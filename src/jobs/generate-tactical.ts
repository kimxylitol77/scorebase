// 경기 후 전술 분석 아티클 자동 생성. 게이트 통과한 종료 경기를 골라
// buildTacticalContext → 전술 프롬프트 → Claude 로 본문 생성 → Article(TACTICAL) 저장.
// 게이트는 리그별 — 빅5 는 af 포메이션+xG(DRAFT 저장, 수동 검수), K리그1 은 ts 포메이션+타임라인이고
// 팩트 게이트(fact-gate.ts) 통과 시 바로 PUBLISHED("K리그 이주의 전술 분석" 시리즈).
// 같은 matchId 의 TACTICAL 글이 이미 있으면 스킵.
//
// 사용:
//   npm run job:tactical                 (실제 생성 — 빅5 DRAFT 저장)
//   tsx --env-file=.env.local src/jobs/generate-tactical.ts --league=K_LEAGUE_1        (K리그1 — Vultr 매일 11:00 KST)
//   tsx --env-file=.env.local src/jobs/generate-tactical.ts --dry-run
//   tsx --env-file=.env.local src/jobs/generate-tactical.ts --match=79825 --dry-run
//   tsx --env-file=.env.local src/jobs/generate-tactical.ts --match=79825 --update=4600   (기존 글 본문 재생성 — 상태·slug 유지)

import "@/lib/env";
import { prisma } from "@/lib/db";
import { generateWithMinLength } from "@/lib/ai/generate-with-min-length";
import { SYSTEM_PROMPT } from "@/prompts/system";
import { buildTacticalContext, TS_TACTICAL_LEAGUES, type TacticalContext } from "@/lib/tactical/context";
import { buildTacticalAnalysisPrompt } from "@/prompts/tactical-analysis";
import { hasTacticalData, hasTsFormations } from "@/lib/tactical/data-gate";
import { tacticalFactGateReason } from "@/lib/tactical/fact-gate";
import { insertShapeTokens, linkNamesInMarkdown } from "@/lib/tactical/ts-enrich";

const TARGET_LEAGUES = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "UCL", "UEL", "UECL"];
const LOOKBACK_DAYS = 5; // 최근 종료 경기만 (라이브 운영 시 새 시즌 기준)
const PER_RUN_CAP = 4; // 한 번에 생성할 최대 편수 (양산 방지)
const MIN_TACTICAL_LENGTH = 1500;

// --league= 로 단일 리그를 돌릴 때의 lookback·cap. K리그1 은 매일 돌아 전날 경기를 전부 처리한다(라운드 최대 6경기).
const LEAGUE_RUN: Record<string, { lookbackDays: number; cap: number }> = {
  K_LEAGUE_1: { lookbackDays: 3, cap: 6 },
};
// 팩트 게이트 통과 시 바로 PUBLISHED 하는 리그. 빅5 는 기존 결정(DRAFT → 수동 검수) 유지.
const AUTO_PUBLISH_LEAGUES = new Set<string>(["K_LEAGUE_1"]);
// 시리즈 킥커 — H1 아래 한 줄. 라운드는 af raw 에서(없으면 리그명만).
const SERIES_LABEL: Record<string, string> = { K_LEAGUE_1: "K리그 이주의 전술 분석" };

function extractTitle(md: string): string {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : "전술 분석";
}

/** 게이트 통과 + 미생성 종료 경기 후보 id 수집. matchId 지정 시 그 경기만. */
async function collectCandidates(matchId: number | null, leagues: string[] | null): Promise<number[]> {
  if (matchId != null) return [matchId];

  const single = leagues?.length === 1 ? LEAGUE_RUN[leagues[0]] : undefined;
  const lookbackDays = single?.lookbackDays ?? LOOKBACK_DAYS;
  const cap = single?.cap ?? PER_RUN_CAP;
  const since = new Date(Date.now() - lookbackDays * 24 * 3600 * 1000);
  const rows = await prisma.match.findMany({
    where: {
      league: { in: leagues ?? TARGET_LEAGUES },
      status: "FINISHED",
      startTime: { gte: since },
      articles: { none: { type: "TACTICAL" } }, // 이미 전술글 있는 경기 제외
    },
    select: {
      id: true,
      league: true,
      status: true,
      lineupHome: true,
      lineupAway: true,
      fixtureStats: true,
      startTime: true,
      theSportsCache: { select: { lineup: true } },
    },
    orderBy: { startTime: "desc" },
  });
  // ts 전용 리그는 xG 가 없어 af 게이트를 못 넘는다 — ts 양 팀 포메이션으로 1차 선별(타임라인은 컨텍스트 조립에서 확정).
  return rows
    .filter((r) => hasTacticalData(r) || (TS_TACTICAL_LEAGUES.has(r.league) && hasTsFormations(r.theSportsCache?.lineup)))
    .slice(0, cap)
    .map((r) => r.id);
}

/** 시리즈 리그면 H1 바로 아래 킥커 한 줄 — "*K리그 이주의 전술 분석 — K리그1 28라운드*". 결정적(LLM 산출 아님). */
function insertSeriesKicker(md: string, ctx: TacticalContext): string {
  const label = SERIES_LABEL[ctx.league];
  if (!label) return md;
  const kicker = `*${label}${ctx.round != null ? ` — K리그1 ${ctx.round}라운드` : ""}*`;
  const lines = md.split("\n");
  const h1 = lines.findIndex((l) => l.startsWith("# "));
  if (h1 === -1) return `${kicker}\n\n${md}`;
  lines.splice(h1 + 1, 0, "", kicker);
  return lines.join("\n");
}

/** 본문 후처리 — 등재된 선수·감독 이름 첫 등장에 링크, 끝에 전술판 프리로드 링크. 전부 결정적(LLM 산출 아님). */
function decorate(content: string, ctx: TacticalContext): string {
  let out = linkNamesInMarkdown(insertSeriesKicker(content, ctx), ctx.links);
  // 좌표가 있을 때만 도식 토큰 — 글 페이지가 토큰 자리에 양 팀 셋업 도식을 그린다(없으면 토큰 제거).
  if (ctx.lineupCode) out = insertShapeTokens(out);
  if (ctx.lineupCode) {
    out += `\n\n---\n\n[▶ ${ctx.home} vs ${ctx.away} 양 팀 선발 라인업을 전술판에서 열기](/lineup?d=${ctx.lineupCode}) — 실제 경기 평균 위치 좌표 그대로 불러옵니다. 선수를 끌어 옮기고 화살표를 그려 나만의 해석을 남겨 보세요.`;
  }
  return out;
}

export async function runTactical(
  opts: { dryRun?: boolean; matchId?: number | null; updateArticleId?: number | null; leagues?: string[] | null } = {},
) {
  const dryRun = opts.dryRun ?? false;
  const updateId = opts.updateArticleId ?? null;
  const leagues = opts.leagues ?? null;
  console.log(`[tactical] 시작 (dryRun=${dryRun}${leagues ? `, leagues=${leagues.join(",")}` : ""})`);

  const ids = await collectCandidates(opts.matchId ?? null, leagues);
  if (ids.length === 0) {
    console.log("[tactical] 대상 경기 없음 — 종료");
    return;
  }
  console.log(`[tactical] 대상 ${ids.length}경기: ${ids.join(", ")}`);

  for (const id of ids) {
    try {
      // 중복 재확인 (동시성)
      const existing = await prisma.article.findFirst({
        where: { matchId: id, type: "TACTICAL" },
      });
      if (existing && !dryRun && existing.id !== updateId) {
        console.log(`[tactical] 매치 ${id} 이미 글 #${existing.id} 있음 — 스킵`);
        continue;
      }

      const ctx = await buildTacticalContext(id);
      if (!ctx) {
        console.log(`[tactical] 매치 ${id} 컨텍스트 조립 실패(게이트 탈락) — 스킵`);
        continue;
      }

      const prompt = buildTacticalAnalysisPrompt(ctx);
      const raw = await generateWithMinLength(prompt, {
        system: SYSTEM_PROMPT,
        maxTokens: 4500,
        temperature: 0.6,
        minLength: MIN_TACTICAL_LENGTH,
        label: `tactical ${ctx.league} ${id}`,
      });
      if (!raw) {
        console.log(`[tactical] 매치 ${id} 본문 길이 미달 — 스킵`);
        continue;
      }
      const content = decorate(raw, ctx);
      const title = extractTitle(content);

      // 자동 발행 리그는 결정적 팩트 게이트를 통과해야 PUBLISHED. 탈락은 DRAFT 로 남겨 검수 대상으로.
      const factReason = AUTO_PUBLISH_LEAGUES.has(ctx.league)
        ? tacticalFactGateReason({ content: raw, dataText: ctx.text, homeScore: ctx.homeScore, awayScore: ctx.awayScore })
        : null;
      const publish = AUTO_PUBLISH_LEAGUES.has(ctx.league) && factReason == null;
      if (factReason) console.log(`[tactical] 매치 ${id} 팩트 게이트 탈락 → DRAFT: ${factReason}`);

      if (dryRun) {
        console.log("\n" + "=".repeat(60));
        console.log(`[DRY-RUN] 매치 ${id} · ${ctx.home} ${ctx.homeScore}-${ctx.awayScore} ${ctx.away} · ${content.length}자 · ${publish ? "PUBLISHED 예정" : "DRAFT 예정"}`);
        console.log("=".repeat(60));
        console.log(content);
        console.log("=".repeat(60) + "\n");
        continue;
      }

      if (updateId != null) {
        // 기존 글 본문만 교체 — slug·status·publishedAt 은 그대로(이미 색인된 URL 유지).
        await prisma.article.update({ where: { id: updateId }, data: { title, content } });
        console.log(`[tactical] ♻️ 글 #${updateId} 본문 재생성 ${title} (${content.length}자, 링크 ${ctx.links.length}명)`);
        continue;
      }

      const tempSlug = `tmp-tactical-${Date.now()}-${ctx.league}-${Math.random().toString(36).slice(2, 6)}`;
      const article = await prisma.article.create({
        data: {
          type: "TACTICAL",
          matchId: id,
          league: ctx.league,
          title,
          slug: tempSlug,
          content,
          // 빅5 는 DRAFT(수동 검수 후 전환). 자동 발행 리그는 팩트 게이트 통과 시 바로 PUBLISHED.
          status: publish ? "PUBLISHED" : "DRAFT",
          publishedAt: publish ? new Date() : null,
        },
      });
      const finalSlug = `${ctx.league.toLowerCase()}-tactical-${article.id}`;
      await prisma.article.update({
        where: { id: article.id },
        data: { slug: finalSlug },
      });
      console.log(`[tactical] ✅ 매치 ${id} → 글 #${article.id} (${publish ? "PUBLISHED" : "DRAFT"}) ${title} (${content.length}자)`);

      await new Promise((r) => setTimeout(r, 5000)); // 분당 한도 안전
    } catch (e) {
      console.error(`[tactical] 매치 ${id} 실패:`, (e as Error).message?.slice(0, 120));
    }
  }

  console.log("[tactical] 완료");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const matchArg = args.find((a) => a.startsWith("--match="));
  const matchId = matchArg ? Number(matchArg.split("=")[1]) : null;
  const updateArg = args.find((a) => a.startsWith("--update="));
  const updateArticleId = updateArg ? Number(updateArg.split("=")[1]) : null;
  const leagueArg = args.find((a) => a.startsWith("--league="));
  const leagues = leagueArg ? leagueArg.split("=")[1].split(",").filter(Boolean) : null;
  if (updateArticleId != null && matchId == null) {
    console.error("[tactical] --update 는 --match 와 함께 써야 합니다");
    process.exit(1);
  }
  runTactical({ dryRun, matchId, updateArticleId, leagues })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
