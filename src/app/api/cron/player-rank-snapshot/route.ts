// 선수 랭킹 순위 스냅샷 cron — 목록 URL 13개를 두드려 페이지가 오늘자 스냅샷을 남기게 하고, 14일 지난 행을 정리한다.
// 순위 계산은 페이지(/transfers)에만 있어(후보 풀 구성이 페이지 모듈에 묶임) 자체 계산 대신 렌더를 유도한다.
import { selfUserAgent, siteOrigin } from "@/lib/self-fetch";
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { pruneRankSnapshots } from "@/lib/transfers/rank-snapshots";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SITE = siteOrigin();
const LISTS = [
  "", "view=power", "view=prospects", "view=prospects&age=23", "view=growth", "view=growth&g=abs", "view=growth&g=down",
  "view=bargain", "view=form", "view=form&g=cold", "view=trophies", "view=contracts",
];

// 우리 배치가 우리 사이트를 부를 때의 신분 표시.
// - user-agent 의 "vercel-cron": Vercel 방화벽의 「우리 인프라 통과」 규칙이 이 문자열로 봇 검문을 건너뛰게 한다.
//   2026-09-23 21:18 봇 검문을 challenge 로 올린 뒤 이 배치만 옛 UA 라 닷새 연속 12개 전부 429
//   (응답 헤더 x-vercel-mitigated: challenge). 규칙을 바꾸면 여기도 같이 볼 것.
// - Bearer INTERNAL_API_TOKEN: 미들웨어 속도 제한(IP 당 분당 600)의 면제 경로.
const HEADERS: Record<string, string> = {
  "user-agent": selfUserAgent("rank-snapshot"),
  ...(process.env.INTERNAL_API_TOKEN ? { authorization: `Bearer ${process.env.INTERNAL_API_TOKEN}` } : {}),
};

export async function GET(req: Request) {
  if (!authorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  const results: Record<string, number> = {};
  let ok = 0;
  let firstError = "";
  for (const q of LISTS) {
    const url = `${SITE}/transfers${q ? `?${q}` : ""}`;
    try {
      const r = await fetch(url, { cache: "no-store", headers: HEADERS, signal: AbortSignal.timeout(60_000) });
      results[q || "value"] = r.status;
      if (r.ok) ok++;
      // 본문은 버린다 — 저장은 페이지의 after() 가 한다. 실패면 누가 막았는지(플랫폼 방화벽·미들웨어) 첫 건만 남긴다.
      const body = await r.text().catch(() => "");
      if (!r.ok && !firstError) {
        firstError = `${r.status} mitigated=${r.headers.get("x-vercel-mitigated") ?? "-"} server=${r.headers.get("server") ?? "-"} retry-after=${r.headers.get("retry-after") ?? "-"} body=${body.slice(0, 80).replace(/\s+/g, " ")}`;
      }
    } catch (e) {
      results[q || "value"] = -1;
      if (!firstError) firstError = (e as Error).message;
      console.error("[player-rank-snapshot] fetch fail", url, (e as Error).message);
    }
  }
  const pruned = await pruneRankSnapshots().catch(() => 0);
  await recordCronRun("player-rank-snapshot", { count: ok, ok: ok === LISTS.length, ...(firstError ? { error: firstError } : {}) });
  return NextResponse.json({ ok: ok === LISTS.length, fetched: ok, of: LISTS.length, pruned, results, firstError });
}
