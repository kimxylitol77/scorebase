// KBO·NPB 포스트시즌 선수 기록 합산 cron — 매일(KST 06:10, NPB 로그 수집 뒤). 10~11월 밖이면 건너뛴다.
//   ?league=KBO|NPB&season=Y 로 수동 재수집. 시즌 단위 교체라 지난 시즌 행은 건드리지 않는다.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runCollectBaseballPostseason } from "@/jobs/collect-baseball-postseason";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!authorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const seasonParam = url.searchParams.get("season");
  const leagueParam = url.searchParams.get("league");
  const kst = new Date(Date.now() + 9 * 3600_000);
  if (!seasonParam && ![10, 11].includes(kst.getUTCMonth() + 1)) {
    await recordCronRun("baseball-postseason-stats", { count: 0 });
    return NextResponse.json({ ok: true, skipped: "off-postseason-months" });
  }
  const season = seasonParam ? Number(seasonParam) : kst.getUTCFullYear();
  const leagues = (leagueParam ? [leagueParam] : ["KBO", "NPB"]).filter((l): l is "KBO" | "NPB" => l === "KBO" || l === "NPB");
  const results = [];
  const errors: string[] = [];
  for (const lg of leagues) {
    try {
      results.push(await runCollectBaseballPostseason(lg, season));
    } catch (e) {
      errors.push(`${lg}: ${(e as Error).message}`);
    }
  }
  const saved = results.reduce((a, r) => a + r.saved, 0);
  await recordCronRun("baseball-postseason-stats", errors.length ? { ok: false, error: errors.join(" / ") } : { count: saved });
  return NextResponse.json({ ok: errors.length === 0, results, errors }, { status: errors.length ? 500 : 200 });
}
