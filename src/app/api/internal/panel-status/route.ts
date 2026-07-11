// 패널 활성 상태 진단 — 어떤 패널이 켜졌나 + 게이트/키 env 존재 여부(값은 노출 안 함).
// grok 처럼 "안 붙는" 패널의 원인(게이트 OFF vs 키 없음)을 짐작 없이 찍기 위함.
// 인증: Bearer INTERNAL_API_TOKEN / CRON_SECRET.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { PANELISTS, activePanelists, isPanelEnabled } from "@/lib/predict/panelists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!authorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  const activeV = new Set(activePanelists("vercel").map((p) => p.key));
  const activeM = new Set(activePanelists("macmini").map((p) => p.key));
  const panels = PANELISTS.map((p) => ({
    key: p.key,
    location: p.location,
    gate: p.enabledEnv ?? "(always)",
    gateOn: isPanelEnabled(p),
    keyEnv: p.apiKeyEnv ?? "(none)",
    keyPresent: p.apiKeyEnv ? Boolean(process.env[p.apiKeyEnv]) : true,
    active: activeV.has(p.key) || activeM.has(p.key),
  }));
  return NextResponse.json({ ok: true, panels });
}
