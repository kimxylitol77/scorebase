// GET /api/internal/firewall-selfcheck — 함수가 자기 사이트를 부를 때 방화벽 봇 검문에 걸리는지 실측한다.
// 집·워커 IP 는 통과 규칙에 등록돼 있어 밖에서 curl 로는 판별이 안 된다. 함수 안에서 직접 불러 봐야 안다.
// 부작용 없는 대상만 부른다(cron 경로는 인증 없이 불러 401 이면 "방화벽은 통과"). Bearer INTERNAL_API_TOKEN.
import { NextResponse } from "next/server";
import { internalAuthorized } from "@/lib/internal-auth";
import { selfUserAgent, siteOrigin } from "@/lib/self-fetch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TARGETS = ["/games", "/api/live/baseball/0", "/api/cron/cron-freshness"];
const VARIANTS: Array<[string, Record<string, string>]> = [
  ["기본(UA 없음)", {}],
  ["옛 봇 UA", { "user-agent": "scorebase-health-bot/1" }],
  ["통과 UA", { "user-agent": selfUserAgent("selfcheck") }],
  [
    "통과 UA + 내부 토큰",
    { "user-agent": selfUserAgent("selfcheck"), ...(process.env.INTERNAL_API_TOKEN ? { authorization: `Bearer ${process.env.INTERNAL_API_TOKEN}` } : {}) },
  ],
];

export async function GET(req: Request) {
  if (!internalAuthorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  const rows: Array<{ target: string; variant: string; status: number; mitigated: string | null }> = [];
  // ?path=/api/live/baseball/187486 처럼 특정 경로를 지정해 볼 수 있다 (우리 사이트 경로만)
  const extra = new URL(req.url).searchParams.getAll("path").filter((p) => p.startsWith("/") && !p.startsWith("//"));
  for (const target of extra.length ? extra : TARGETS) {
    for (const [variant, headers] of VARIANTS) {
      try {
        const r = await fetch(`${siteOrigin()}${target}`, { headers, cache: "no-store", signal: AbortSignal.timeout(15_000) });
        await r.arrayBuffer().catch(() => undefined);
        rows.push({ target, variant, status: r.status, mitigated: r.headers.get("x-vercel-mitigated") });
      } catch (e) {
        rows.push({ target, variant, status: -1, mitigated: (e as Error).message.slice(0, 60) });
      }
    }
  }
  const challenged = rows.filter((r) => r.mitigated === "challenge" || r.mitigated === "deny");
  return NextResponse.json({
    ok: !challenged.some((r) => r.variant.startsWith("통과 UA")),
    challenged: challenged.length,
    hasInternalToken: !!process.env.INTERNAL_API_TOKEN,
    site: siteOrigin(),
    rows,
  });
}
