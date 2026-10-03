// /api/cron/new-competition-scout — 신규 대회 후보 주간 보고(월 10:20 KST, 2026-10-03).
// 향후 14일 원천 일정에서 우리에게 없는 대회를 점수순으로 골라(lib/sports/new-competition-*) 텔레그램으로 보낸다.
// 한국 관련 대회는 전부, 나머지는 상위 5개. 같은 대회는 4주 안에 다시 보내지 않는다(HealthCheck 이력). 추가는 사람이 한다.
import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { recordCronRun } from "@/lib/cron-registry";
import { sendTelegram } from "@/lib/notify/telegram";
import { scoutNewCompetitions } from "@/lib/sports/new-competition-scout";
import { rankCandidates } from "@/lib/sports/new-competition-score";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CATEGORY = "new-competition";
const RENOTIFY_MS = 28 * 86400_000;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  try {
    const all = await scoutNewCompetitions({ budgetMs: 220_000 });
    const ranked = rankCandidates(all, 5);
    const recent = await prisma.healthCheck.findMany({
      where: { category: CATEGORY, runAt: { gte: new Date(Date.now() - RENOTIFY_MS) } },
      select: { key: true },
    });
    const seen = new Set(recent.map((r) => r.key));
    const fresh = ranked.filter((c) => !seen.has(`${c.source}:${c.id}`));
    if (fresh.length) {
      await prisma.healthCheck.createMany({
        data: fresh.map((c) => ({
          severity: c.korea.length ? "MED" : "LOW",
          category: CATEGORY,
          key: `${c.source}:${c.id}`,
          message: `${c.name} (${c.country || "-"}) ${c.matches}경기`.slice(0, 900),
          metadata: { ...c },
        })),
      });
      const line = (c: (typeof fresh)[number]) =>
        `- ${c.name} (${c.country || "-"}, ${c.source} ${c.id}) ${c.matches}경기${c.national ? " · 대표팀 대회" : ""}${c.korea.length ? `\n  한국: ${c.korea.join(", ")}` : ""}`;
      const korea = fresh.filter((c) => c.korea.length);
      const rest = fresh.filter((c) => !c.korea.length);
      await sendTelegram(
        [
          `<b>[신규 대회 후보] 향후 14일 일정 중 우리에게 없는 대회</b> (미매핑 ${all.length}개 중)`,
          ...(korea.length ? ["", "<b>한국 관련</b>", ...korea.map(line)] : []),
          ...(rest.length ? ["", "<b>그 외 상위</b>", ...rest.map(line)] : []),
          "",
          "추가는 리그 코드·순위·팀 매핑·탭을 한 묶음으로. 전체 목록: npx tsx --env-file=.env.local scripts/scout-new-competitions.ts --top=20",
        ].join("\n"),
      ).catch(() => undefined);
    }
    await recordCronRun("new-competition-scout", { count: fresh.length });
    return NextResponse.json({ ok: true, unmapped: all.length, candidates: ranked.length, notified: fresh.map((c) => c.name) });
  } catch (e) {
    const error = (e as Error).message;
    await recordCronRun("new-competition-scout", { ok: false, error }).catch(() => undefined);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
