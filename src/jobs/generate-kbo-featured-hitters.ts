// KBO 오늘의 주목 타자 Top 3 ANALYSIS 자동 발행 — 결정론(LLM 0), 일간 멱등 slug.
// 사용: npm run job:kbo-featured-hitters  (옵션: -- 2026-07-18 --dry)
import "@/lib/env";
import { prisma } from "@/lib/db";
import {
  buildKboFeaturedHitters,
  type FeaturedGame,
} from "@/lib/sports/baseball/kbo-featured-hitters";

function kstDateStr(d: Date): string {
  return new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);
}

function playerLink(name: string, externalId?: string): string {
  return externalId ? `[${name}](/players/${externalId}?league=KBO)` : name;
}

function buildMarkdown(games: FeaturedGame[], kstDate: string): string {
  const [, mo, dd] = kstDate.split("-");
  const dateLabel = `${Number(mo)}월 ${Number(dd)}일`;
  const lines: string[] = [];
  lines.push(`# 오늘의 주목 타자 Top 3 — ${dateLabel} KBO ${games.length}경기`);
  lines.push("");
  lines.push(
    `${dateLabel} KBO ${games.length}경기의 경기별 주목 타자를 골랐다. ` +
      `선정 기준은 시즌 OPS 에 상대 선발 매치업 보정(FIP 우선, ERA 보조)을 곱한 점수이며, ` +
      `수치는 모두 시즌 누적 공식 기록이다.`,
  );
  for (const g of games) {
    lines.push("");
    lines.push(`## ${g.awayTeam} vs ${g.homeTeam} (${g.startTimeKst})`);
    lines.push("");
    if (g.parkNote) {
      lines.push(`*${g.parkNote}*`);
      lines.push("");
    }
    lines.push(`| # | 타자 | 소속 | 타율 | OPS | HR·타점 | 주목 포인트 |`);
    lines.push(`|---|---|---|---|---|---|---|`);
    g.hitters.forEach((h, i) => {
      lines.push(
        `| ${i + 1} | ${playerLink(h.playerName, h.externalId)} | ${h.teamName} | ` +
          `${h.avg != null ? h.avg.toFixed(3) : "-"} | ${h.ops.toFixed(3)} | ` +
          `${h.homeRuns ?? 0}·${h.rbi ?? 0} | ${h.reason} |`,
      );
    });
  }
  lines.push("");
  lines.push(
    `선정은 시즌 누적 데이터 기반 자동 산출이며, 확정 라인업 발표에 따라 실제 출전 여부는 달라질 수 있다.`,
  );
  return lines.join("\n");
}

export async function runKboFeaturedHitters(
  opts: { refDate?: Date; dry?: boolean } = {},
) {
  const refDate = opts.refDate ?? new Date();
  const kstDate = kstDateStr(refDate);
  const slug = `kbo-featured-hitters-${kstDate}`;

  const existing = await prisma.article.findUnique({ where: { slug } });
  if (existing) {
    console.log(`[featured-hitters] 오늘 글 이미 있음 (#${existing.id}) — 스킵`);
    return { skipped: "exists" as const };
  }

  const games = await buildKboFeaturedHitters(refDate);
  if (games.length === 0) {
    console.log("[featured-hitters] 오늘 대상 KBO 경기 없음 — 스킵");
    return { skipped: "no-games" as const };
  }

  const content = buildMarkdown(games, kstDate);
  const title =
    content.match(/^#\s+(.+)$/m)?.[1] ?? `오늘의 주목 타자 Top 3 (${kstDate})`;

  if (opts.dry) {
    console.log(`\n===== [DRY] ${slug} =====\n`);
    console.log(content);
    return { dry: true as const, games: games.length };
  }

  const article = await prisma.article.create({
    data: {
      type: "ANALYSIS",
      league: "KBO",
      title,
      slug,
      content,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  console.log(
    `[featured-hitters] ✅ 발행 #${article.id} (${games.length}경기) → /articles/${slug}`,
  );
  return { published: article.id, games: games.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const dateArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  runKboFeaturedHitters({
    refDate: dateArg ? new Date(`${dateArg}T12:00:00+09:00`) : undefined,
    dry,
  })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
