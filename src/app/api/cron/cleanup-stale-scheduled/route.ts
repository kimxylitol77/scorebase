// /api/cron/cleanup-stale-scheduled — 4시간 주기.
// 시작 시각 + STALE_HOURS 후까지 SCHEDULED 인 매치 → POSTPONED 자동 처리.
// source (ESPN/api-football/TheSports) 무관 — cleanup-ghost 가 cover 못하는 리그
// (USL_CH, JUPILER_PL, SINGAPORE_PL, NPB/KBO 등 비-ESPN) 까지 포괄.
//
// 처리 결과:
//   1) 텔레그램 알림 (5요소 + Haiku 진단)
//   2) HealthCheck row insert → /admin/health 페이지에 자동 노출

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { sendTelegram } from "@/lib/notify/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STALE_HOURS = 12;

// 리그 → data source 매핑 (Haiku 진단 prompt 용 + 알림 hint)
const SOURCE_HINT: Record<string, string> = {
  KBO: "api-baseball + TheSports",
  NPB: "api-baseball + TheSports",
  MLB: "ESPN + api-baseball",
  NBA: "BALLDONTLIE",
  NHL: "BALLDONTLIE",
  LOL: "BALLDONTLIE / Leaguepedia",
  EPL: "football-data + TheSports",
  LALIGA: "ESPN + TheSports",
  BUNDESLIGA: "ESPN + TheSports",
  SERIE_A: "ESPN + TheSports",
  LIGUE_1: "ESPN + TheSports",
  UCL: "ESPN + TheSports",
  UEL: "ESPN + TheSports",
  MLS: "ESPN",
  K_LEAGUE: "api-football + TheSports",
  J_LEAGUE: "api-football + TheSports",
  USA_USL_CH: "api-football",
  SINGAPORE_PL: "api-football",
  JUPILER_PL: "TheSports (Lightsail)",
};

async function diagnoseWithHaiku(prompt: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    return data?.content?.[0]?.text?.trim() ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  // Vercel cron secret auth (CRON_SECRET) 또는 INTERNAL_API_TOKEN
  const auth = req.headers.get("authorization") ?? "";
  const cronOk =
    process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  const intOk =
    process.env.INTERNAL_API_TOKEN &&
    auth === `Bearer ${process.env.INTERNAL_API_TOKEN}`;
  // Vercel cron 은 user-agent vercel-cron/1.0
  const ua = req.headers.get("user-agent") ?? "";
  const vercelCron = ua.includes("vercel-cron");
  if (!cronOk && !intOk && !vercelCron) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - STALE_HOURS * 3600 * 1000);
  const stale = await prisma.match.findMany({
    where: { status: "SCHEDULED", startTime: { lt: cutoff } },
    include: { homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
    orderBy: { startTime: "asc" },
  });

  if (stale.length === 0) {
    // OK row 도 남김 — /admin/health 에서 "정상 동작 중" 확인 가능
    await prisma.healthCheck.create({
      data: {
        severity: "OK",
        category: "stale-cleanup",
        key: "summary",
        message: "stale SCHEDULED 매치 없음 — 모든 cron 정상",
        metadata: { marked: 0, staleHours: STALE_HOURS },
      },
    });
    return NextResponse.json({ ok: true, marked: 0 });
  }

  await prisma.match.updateMany({
    where: { id: { in: stale.map((m) => m.id) } },
    data: { status: "POSTPONED" },
  });

  // 리그별 카운트 + sample + source hint
  const byLeague: Record<string, number> = {};
  for (const m of stale) byLeague[m.league] = (byLeague[m.league] ?? 0) + 1;
  const leagueLines = Object.entries(byLeague)
    .sort((a, b) => b[1] - a[1])
    .map(([l, n]) => `  ${l}: ${n}건 (source: ${SOURCE_HINT[l] ?? "unknown"})`)
    .join("\n");
  const sampleLines = stale
    .slice(0, 8)
    .map(
      (m) =>
        `  ${m.startTime.toISOString().slice(5, 16)} | ${m.league} | ${m.awayTeam.name} vs ${m.homeTeam.name}`,
    )
    .join("\n");

  // Haiku 진단 — ANTHROPIC_API_KEY 있을 때만
  const diagnosePrompt =
    `다음은 scorebase 의 stale 매치 자동 정리 보고서입니다.\n` +
    `시작 시각 + ${STALE_HOURS}시간 지났는데 SCHEDULED 상태로 남은 매치들 (= cron 업데이트 누락).\n\n` +
    `리그별 카운트:\n${leagueLines}\n\n` +
    `샘플:\n${sampleLines}\n\n` +
    `요청:\n` +
    `1) 각 리그별 가장 가능성 높은 원인 1개 (cron 누락 / source API 변화 / collector 미지원 / 오프시즌 / 비공식 매치 등)\n` +
    `2) 즉시 확인할 곳 (예: "vercel logs --grep collect", "Lightsail systemd logs")\n` +
    `3) 정상 (오프시즌 등) 인 경우 명시\n\n` +
    `형식: 리그명별 1줄 (한국어). 마지막 줄에 종합 권장 action 1개.`;
  const diagnosis = await diagnoseWithHaiku(diagnosePrompt);

  // HealthCheck row insert — /admin/health 에 자동 노출
  const severity = stale.length >= 10 ? "HIGH" : stale.length >= 3 ? "MED" : "LOW";
  await prisma.healthCheck.create({
    data: {
      severity,
      category: "stale-cleanup",
      key: "summary",
      message: `stale SCHEDULED ${stale.length}건 자동 POSTPONED (${Object.keys(byLeague).length}개 리그)`,
      metadata: {
        marked: stale.length,
        staleHours: STALE_HOURS,
        byLeague,
        sample: stale.slice(0, 10).map((m) => ({
          id: m.id,
          league: m.league,
          source: SOURCE_HINT[m.league] ?? "unknown",
          teams: `${m.awayTeam.name} vs ${m.homeTeam.name}`,
          startTime: m.startTime.toISOString(),
        })),
        diagnosis: diagnosis ?? null,
      },
    },
  });

  // 텔레그램 알림 — 진단 포함
  try {
    await sendTelegram(
      `🧹 <b>stale SCHEDULED ${stale.length}건 자동 POSTPONED</b>\n\n` +
        `📍 <b>무엇</b>: 시작 + ${STALE_HOURS}h+ 지났는데 SCHEDULED 상태\n` +
        `💥 <b>영향</b>: /scores 페이지 잘못 노출되던 매치 자동 숨김\n` +
        `🔍 <b>원인</b>: cron 미업데이트 (collector 누락 리그 또는 source API 변화)\n\n` +
        `<b>리그별</b>:\n<code>${leagueLines}</code>\n\n` +
        `<b>sample</b>:\n<code>${sampleLines}</code>\n\n` +
        (diagnosis
          ? `🤖 <b>Haiku 진단</b>:\n${diagnosis}\n\n`
          : `<i>(ANTHROPIC_API_KEY 미설정 — Vercel env 등록 시 AI 진단 활성)</i>\n\n`) +
        `➡️ <b>확인</b>: scorebase.kr/admin/health (category=stale-cleanup)\n\n` +
        `<code>[안내] cron-cleanup-stale-scheduled</code>`,
    );
  } catch (e) {
    console.warn("[cleanup-stale-scheduled] telegram fail:", (e as Error).message);
  }

  return NextResponse.json({
    ok: true,
    marked: stale.length,
    byLeague,
    diagnosis,
    sample: stale.slice(0, 5).map((m) => ({
      id: m.id,
      league: m.league,
      teams: `${m.awayTeam.name} vs ${m.homeTeam.name}`,
      startTime: m.startTime.toISOString(),
    })),
  });
}
