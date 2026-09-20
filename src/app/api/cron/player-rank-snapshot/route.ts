// 선수 랭킹 순위 스냅샷 cron — 목록 URL 13개를 두드려 페이지가 오늘자 스냅샷을 남기게 하고, 14일 지난 행을 정리한다.
// 순위 계산은 페이지(/transfers)에만 있어(후보 풀 구성이 페이지 모듈에 묶임) 자체 계산 대신 렌더를 유도한다.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { pruneRankSnapshots } from "@/lib/transfers/rank-snapshots";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SITE = process.env.SITE_URL ?? "https://www.scorebase.kr";
const LISTS = [
  "", "view=power", "view=prospects", "view=prospects&age=23", "view=growth", "view=growth&g=abs", "view=growth&g=down",
  "view=bargain", "view=form", "view=form&g=cold", "view=trophies", "view=contracts",
];

export async function GET(req: Request) {
  if (!authorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  const results: Record<string, number> = {};
  let ok = 0;
  for (const q of LISTS) {
    const url = `${SITE}/transfers${q ? `?${q}` : ""}`;
    try {
      const r = await fetch(url, { cache: "no-store", headers: { "user-agent": "scorebase-rank-snapshot" }, signal: AbortSignal.timeout(60_000) });
      results[q || "value"] = r.status;
      if (r.ok) ok++;
      // 본문은 버린다 — 저장은 페이지의 after() 가 한다.
      await r.arrayBuffer().catch(() => undefined);
    } catch (e) {
      results[q || "value"] = -1;
      console.error("[player-rank-snapshot] fetch fail", url, (e as Error).message);
    }
  }
  const pruned = await pruneRankSnapshots().catch(() => 0);
  await recordCronRun("player-rank-snapshot", { count: ok, ok: ok === LISTS.length });
  return NextResponse.json({ ok: ok === LISTS.length, fetched: ok, of: LISTS.length, pruned, results });
}
