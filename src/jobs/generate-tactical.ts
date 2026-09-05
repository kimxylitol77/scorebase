// 경기 후 전술 분석 아티클 자동 생성. 게이트(포메이션+xG) 통과한 종료 경기를 골라
// buildTacticalContext → 전술 프롬프트 → Claude 로 본문 생성 → Article(TACTICAL, DRAFT) 저장.
// 같은 matchId 의 TACTICAL 글이 이미 있으면 스킵.
//
// 사용:
//   npm run job:tactical                 (실제 생성 — DRAFT 저장)
//   tsx --env-file=.env.local src/jobs/generate-tactical.ts --dry-run
//   tsx --env-file=.env.local src/jobs/generate-tactical.ts --match=79825 --dry-run
//   tsx --env-file=.env.local src/jobs/generate-tactical.ts --match=79825 --update=4600   (기존 글 본문 재생성 — 상태·slug 유지)

import "@/lib/env";
import { prisma } from "@/lib/db";
import { generateWithMinLength } from "@/lib/ai/generate-with-min-length";
import { SYSTEM_PROMPT } from "@/prompts/system";
import { buildTacticalContext } from "@/lib/tactical/context";
import { buildTacticalAnalysisPrompt } from "@/prompts/tactical-analysis";
import { hasTacticalData } from "@/lib/tactical/data-gate";
import { linkNamesInMarkdown } from "@/lib/tactical/ts-enrich";

const TARGET_LEAGUES = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "UCL", "UEL", "UECL"];
const LOOKBACK_DAYS = 5; // 최근 종료 경기만 (라이브 운영 시 새 시즌 기준)
const PER_RUN_CAP = 4; // 한 번에 생성할 최대 편수 (양산 방지)
const MIN_TACTICAL_LENGTH = 1500;

function extractTitle(md: string): string {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : "전술 분석";
}

/** 게이트 통과 + 미생성 종료 경기 후보 id 수집. matchId 지정 시 그 경기만. */
async function collectCandidates(matchId: number | null): Promise<number[]> {
  if (matchId != null) return [matchId];

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000);
  const rows = await prisma.match.findMany({
    where: {
      league: { in: TARGET_LEAGUES },
      status: "FINISHED",
      startTime: { gte: since },
      articles: { none: { type: "TACTICAL" } }, // 이미 전술글 있는 경기 제외
    },
    select: {
      id: true,
      status: true,
      lineupHome: true,
      lineupAway: true,
      fixtureStats: true,
      startTime: true,
    },
    orderBy: { startTime: "desc" },
  });
  return rows.filter(hasTacticalData).slice(0, PER_RUN_CAP).map((r) => r.id);
}

/** 본문 후처리 — 등재된 선수·감독 이름 첫 등장에 링크, 끝에 전술판 프리로드 링크. 전부 결정적(LLM 산출 아님). */
function decorate(content: string, ctx: { links: { name: string; href: string }[]; lineupCode: string | null; home: string; away: string }): string {
  let out = linkNamesInMarkdown(content, ctx.links);
  if (ctx.lineupCode) {
    out += `\n\n---\n\n[▶ ${ctx.home} vs ${ctx.away} 양 팀 선발 라인업을 전술판에서 열기](/lineup?d=${ctx.lineupCode}) — 실제 경기 평균 위치 좌표 그대로 불러옵니다. 선수를 끌어 옮기고 화살표를 그려 나만의 해석을 남겨 보세요.`;
  }
  return out;
}

export async function runTactical(opts: { dryRun?: boolean; matchId?: number | null; updateArticleId?: number | null } = {}) {
  const dryRun = opts.dryRun ?? false;
  const updateId = opts.updateArticleId ?? null;
  console.log(`[tactical] 시작 (dryRun=${dryRun})`);

  const ids = await collectCandidates(opts.matchId ?? null);
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

      if (dryRun) {
        console.log("\n" + "=".repeat(60));
        console.log(`[DRY-RUN] 매치 ${id} · ${ctx.home} ${ctx.homeScore}-${ctx.awayScore} ${ctx.away} · ${content.length}자`);
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
          status: "DRAFT", // MVP — 수동 검수 후 PUBLISHED 전환
        },
      });
      const finalSlug = `${ctx.league.toLowerCase()}-tactical-${article.id}`;
      await prisma.article.update({
        where: { id: article.id },
        data: { slug: finalSlug },
      });
      console.log(`[tactical] ✅ 매치 ${id} → 글 #${article.id} (DRAFT) ${title} (${content.length}자)`);

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
  if (updateArticleId != null && matchId == null) {
    console.error("[tactical] --update 는 --match 와 함께 써야 합니다");
    process.exit(1);
  }
  runTactical({ dryRun, matchId, updateArticleId })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
