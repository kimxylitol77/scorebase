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

const STALE_HOURS = 6;

// 리그 → data source 매핑 (Haiku 진단 prompt 용 + 알림 hint)
// "api-football" 포함된 리그는 stale 처리 전 fixture status 외부 verify.
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
  BUNDESLIGA_2: "api-football + TheSports",
  SERIE_A: "ESPN + TheSports",
  LIGUE_1: "ESPN + TheSports",
  UCL: "ESPN + TheSports",
  UEL: "ESPN + TheSports",
  MLS: "ESPN",
  K_LEAGUE: "api-football + TheSports",
  K_LEAGUE_1: "api-football + TheSports",
  K_LEAGUE_2: "api-football + TheSports",
  J_LEAGUE: "api-football + TheSports",
  J1_LEAGUE: "api-football + TheSports",
  URVALSDEILD: "api-football + TheSports",
  USA_USL_CH: "api-football",
  SINGAPORE_PL: "api-football",
  JUPILER_PL: "TheSports (Lightsail)",
};

// api-football fixture status short → 우리 Match.status + 매치 처리 분기
type VerifyAction =
  | { kind: "FINISHED"; homeScore: number | null; awayScore: number | null }
  | { kind: "LIVE"; homeScore: number | null; awayScore: number | null }
  | { kind: "POSTPONED" }
  | { kind: "SKIP" }; // status 알 수 없음 → 안전하게 기존 로직 (POSTPONED)

function classifyApiFootballStatus(
  short: string,
  goalsHome: number | null,
  goalsAway: number | null,
): VerifyAction {
  if (["FT", "AET", "PEN"].includes(short))
    return { kind: "FINISHED", homeScore: goalsHome, awayScore: goalsAway };
  if (["1H", "HT", "2H", "ET", "BT", "P", "LIVE"].includes(short))
    return { kind: "LIVE", homeScore: goalsHome, awayScore: goalsAway };
  if (["PST", "CANC", "ABD", "AWD", "WO", "SUSP", "INT"].includes(short))
    return { kind: "POSTPONED" };
  // NS / TBD / 알 수 없음 — fallback (POSTPONED)
  return { kind: "SKIP" };
}

// api-football /fixtures?ids 는 chunk size 최대 20.
async function fetchApiFootballStatuses(
  externalIds: string[],
): Promise<Map<string, { short: string; goalsHome: number | null; goalsAway: number | null }>> {
  const result = new Map<string, { short: string; goalsHome: number | null; goalsAway: number | null }>();
  const key = process.env.API_FOOTBALL_KEY;
  if (!key || externalIds.length === 0) return result;

  const chunks: string[][] = [];
  for (let i = 0; i < externalIds.length; i += 20) chunks.push(externalIds.slice(i, i + 20));

  for (const chunk of chunks) {
    try {
      const res = await fetch(
        `https://v3.football.api-sports.io/fixtures?ids=${chunk.join("-")}`,
        {
          headers: { "x-apisports-key": key },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!res.ok) continue;
      const data = (await res.json()) as {
        response?: Array<{
          fixture?: { id?: number; status?: { short?: string } };
          goals?: { home?: number | null; away?: number | null };
        }>;
      };
      for (const f of data?.response ?? []) {
        const fid = f.fixture?.id != null ? String(f.fixture.id) : null;
        const short = f.fixture?.status?.short ?? "";
        if (!fid || !short) continue;
        result.set(fid, {
          short,
          goalsHome: f.goals?.home ?? null,
          goalsAway: f.goals?.away ?? null,
        });
      }
    } catch (e) {
      console.warn("[cleanup-stale-scheduled] api-football verify chunk fail:", (e as Error).message);
    }
  }
  return result;
}

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

  // 1) stale LIVE 매치 처리 (시작 + 6h+ 지났는데 LIVE) — data-sanity 봇 알림 제거
  //    점수 있으면 FINISHED, 없으면 POSTPONED.
  const liveCutoff = new Date(Date.now() - 6 * 3600 * 1000);
  const staleLive = await prisma.match.findMany({
    where: { status: "LIVE", startTime: { lt: liveCutoff } },
    include: { homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
  });
  let liveFinished = 0;
  let livePostponed = 0;
  for (const m of staleLive) {
    const hasScore = m.homeScore != null && m.awayScore != null;
    const newStatus: "FINISHED" | "POSTPONED" = hasScore ? "FINISHED" : "POSTPONED";
    await prisma.match.update({ where: { id: m.id }, data: { status: newStatus } });
    if (newStatus === "FINISHED") liveFinished++; else livePostponed++;
  }

  // 2) stale SCHEDULED 매치 처리
  //    api-football cover 리그는 fixture status 외부 verify → 잘못된 POSTPONED 차단.
  const stale = await prisma.match.findMany({
    where: { status: "SCHEDULED", startTime: { lt: cutoff } },
    include: { homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
    orderBy: { startTime: "asc" },
  });

  // api-football 으로 verify 할 매치 (externalId 가 fixture id 형식)
  const verifyTargets = stale.filter((m) => (SOURCE_HINT[m.league] ?? "").includes("api-football"));
  const verifyMap = await fetchApiFootballStatuses(verifyTargets.map((m) => m.externalId));

  // 분류 결과
  const verifiedFinished: typeof stale = [];
  const verifiedLive: typeof stale = [];
  const verifyKept: typeof stale = []; // NS/TBD 등 — 그대로 SCHEDULED 유지
  const toPostpone: typeof stale = [];

  for (const m of stale) {
    const v = verifyMap.get(m.externalId);
    if (v) {
      const action = classifyApiFootballStatus(v.short, v.goalsHome, v.goalsAway);
      if (action.kind === "FINISHED") {
        await prisma.match.update({
          where: { id: m.id },
          data: {
            status: "FINISHED",
            homeScore: action.homeScore ?? undefined,
            awayScore: action.awayScore ?? undefined,
          },
        });
        verifiedFinished.push(m);
        continue;
      }
      if (action.kind === "LIVE") {
        await prisma.match.update({
          where: { id: m.id },
          data: {
            status: "LIVE",
            homeScore: action.homeScore ?? undefined,
            awayScore: action.awayScore ?? undefined,
          },
        });
        verifiedLive.push(m);
        continue;
      }
      if (action.kind === "POSTPONED") {
        toPostpone.push(m);
        continue;
      }
      // SKIP — NS/TBD 등. 상태 변경하지 않고 SCHEDULED 유지 (다음 cron 에서 재시도)
      verifyKept.push(m);
      continue;
    }
    // verify 대상 아님 또는 응답 없음 — 기존 동작 (POSTPONED)
    toPostpone.push(m);
  }

  if (stale.length === 0 && staleLive.length === 0) {
    // OK row 도 남김 — /admin/health 에서 "정상 동작 중" 확인 가능
    await prisma.healthCheck.create({
      data: {
        severity: "OK",
        category: "stale-cleanup",
        key: "summary",
        message: "stale SCHEDULED/LIVE 매치 없음 — 모든 cron 정상",
        metadata: { marked: 0, staleHours: STALE_HOURS },
      },
    });
    return NextResponse.json({ ok: true, marked: 0, liveFinished: 0, livePostponed: 0 });
  }
  if (stale.length === 0) {
    // LIVE 만 정리된 케이스 — telegram 알림 + 조용히 종료
    await prisma.healthCheck.create({
      data: {
        severity: liveFinished + livePostponed >= 5 ? "MED" : "LOW",
        category: "stale-cleanup",
        key: "live-summary",
        message: `stale LIVE ${staleLive.length}건 정리 (FINISHED ${liveFinished} / POSTPONED ${livePostponed})`,
        metadata: { liveFinished, livePostponed, sample: staleLive.slice(0, 5).map(m => ({ id: m.id, league: m.league, teams: `${m.awayTeam.name} vs ${m.homeTeam.name}` })) },
      },
    });
    return NextResponse.json({ ok: true, marked: 0, liveFinished, livePostponed });
  }

  if (toPostpone.length > 0) {
    await prisma.match.updateMany({
      where: { id: { in: toPostpone.map((m) => m.id) } },
      data: { status: "POSTPONED" },
    });
  }

  // 리그별 카운트 (POSTPONED 처리된 매치만) + sample + source hint
  const byLeague: Record<string, number> = {};
  for (const m of toPostpone) byLeague[m.league] = (byLeague[m.league] ?? 0) + 1;
  const leagueLines = Object.entries(byLeague)
    .sort((a, b) => b[1] - a[1])
    .map(([l, n]) => `  ${l}: ${n}건 (source: ${SOURCE_HINT[l] ?? "unknown"})`)
    .join("\n");
  const sampleLines = toPostpone
    .slice(0, 8)
    .map(
      (m) =>
        `  ${m.startTime.toISOString().slice(5, 16)} | ${m.league} | ${m.awayTeam.name} vs ${m.homeTeam.name}`,
    )
    .join("\n");

  // verify 로 정정된 매치 sample (false positive 차단 실적)
  const correctedLines = [...verifiedFinished, ...verifiedLive]
    .slice(0, 8)
    .map((m) => {
      const v = verifyMap.get(m.externalId);
      const tag = verifiedFinished.includes(m) ? "FT" : "LIVE";
      return `  [${tag}] ${m.league} | ${m.awayTeam.name} vs ${m.homeTeam.name} (api-football ${v?.short ?? "?"})`;
    })
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
  const correctedCount = verifiedFinished.length + verifiedLive.length;
  const severity =
    toPostpone.length >= 10 ? "HIGH" : toPostpone.length >= 3 ? "MED" : correctedCount > 0 ? "LOW" : "LOW";
  await prisma.healthCheck.create({
    data: {
      severity,
      category: "stale-cleanup",
      key: "summary",
      message:
        `stale SCHEDULED ${stale.length}건 — POSTPONED ${toPostpone.length}, ` +
        `FINISHED ${verifiedFinished.length}, LIVE ${verifiedLive.length}, KEPT ${verifyKept.length}`,
      metadata: {
        staleHours: STALE_HOURS,
        totalStale: stale.length,
        postponed: toPostpone.length,
        verifiedFinished: verifiedFinished.length,
        verifiedLive: verifiedLive.length,
        verifyKept: verifyKept.length,
        byLeague,
        sample: toPostpone.slice(0, 10).map((m) => ({
          id: m.id,
          league: m.league,
          source: SOURCE_HINT[m.league] ?? "unknown",
          teams: `${m.awayTeam.name} vs ${m.homeTeam.name}`,
          startTime: m.startTime.toISOString(),
        })),
        correctedSample: [...verifiedFinished, ...verifiedLive].slice(0, 10).map((m) => {
          const v = verifyMap.get(m.externalId);
          return {
            id: m.id,
            league: m.league,
            teams: `${m.awayTeam.name} vs ${m.homeTeam.name}`,
            apiFootballShort: v?.short ?? null,
            goalsHome: v?.goalsHome ?? null,
            goalsAway: v?.goalsAway ?? null,
          };
        }),
        diagnosis: diagnosis ?? null,
      },
    },
  });

  // 텔레그램 알림 — 진단 포함
  try {
    const summary =
      `POSTPONED ${toPostpone.length} / FINISHED ${verifiedFinished.length} / LIVE ${verifiedLive.length}` +
      (verifyKept.length > 0 ? ` / KEPT ${verifyKept.length}` : "");
    await sendTelegram(
      `🧹 <b>stale SCHEDULED ${stale.length}건 처리</b> (${summary})\n\n` +
        `📍 <b>무엇</b>: 시작 + ${STALE_HOURS}h+ 지났는데 SCHEDULED 상태\n` +
        `💥 <b>영향</b>: /scores 페이지 잘못 노출 차단 + api-football verify 로 false positive 제거\n` +
        `🔍 <b>원인</b>: cron 미업데이트 (collector 누락 / source API 변화)\n\n` +
        (toPostpone.length > 0
          ? `<b>POSTPONED 리그별</b>:\n<code>${leagueLines}</code>\n\n<b>sample</b>:\n<code>${sampleLines}</code>\n\n`
          : `<b>POSTPONED 없음</b> — 모두 api-football verify 로 정정됨\n\n`) +
        (correctedCount > 0
          ? `<b>verify 로 정정 (${correctedCount}건)</b>:\n<code>${correctedLines}</code>\n\n`
          : "") +
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
    totalStale: stale.length,
    postponed: toPostpone.length,
    verifiedFinished: verifiedFinished.length,
    verifiedLive: verifiedLive.length,
    verifyKept: verifyKept.length,
    byLeague,
    diagnosis,
    sample: toPostpone.slice(0, 5).map((m) => ({
      id: m.id,
      league: m.league,
      teams: `${m.awayTeam.name} vs ${m.homeTeam.name}`,
      startTime: m.startTime.toISOString(),
    })),
  });
}
