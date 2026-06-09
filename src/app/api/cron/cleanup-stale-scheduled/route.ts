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
import { API_FOOTBALL_LEAGUES } from "@/lib/sports";
import { BASEBALL_LEAGUES } from "@/lib/sports/sport-leagues";
import type { League } from "@/lib/sports/types";

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

  // 1b) future_live 매치 자동 롤백 — startTime 이 미래 (now + 1h+) 인데 status=LIVE.
  // 2026-05-27 NPB #328161 (5/31 시작) 발견. TheSports status_id=0/1 LIVE 잘못 매핑 잔재.
  // status=SCHEDULED + score null 로 즉시 강제 복원 (data-sanity future_live 알림 자동 해소).
  const futureLiveCutoff = new Date(Date.now() + 60 * 60 * 1000);
  const futureLive = await prisma.match.findMany({
    where: { status: "LIVE", startTime: { gt: futureLiveCutoff } },
    select: { id: true, league: true, startTime: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
  });
  let futureLiveRolledBack = 0;
  if (futureLive.length > 0) {
    await prisma.match.updateMany({
      where: { id: { in: futureLive.map((m) => m.id) } },
      data: { status: "SCHEDULED", homeScore: null, awayScore: null },
    });
    futureLiveRolledBack = futureLive.length;
  }

  // 2) stale SCHEDULED 매치 처리
  //    api-football cover 리그는 fixture status 외부 verify → 잘못된 POSTPONED 차단.
  const stale = await prisma.match.findMany({
    where: { status: "SCHEDULED", startTime: { lt: cutoff } },
    include: { homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
    orderBy: { startTime: "asc" },
  });

  // api-football 으로 verify 할 매치 — collectors 에서 source="api-football" 로 태그된 리그만.
  // (SOURCE_HINT 화이트리스트는 누락 리그 — MOLDOVA_SL/COPA_LIB/ICELAND_1L 등 — 가 영구 stuck 됐음.
  //  ESPN/TheSports id 리그는 제외해 fixture id 오조회 방지. 숫자 ext 가드는 belt-and-suspenders.)
  const verifyTargets = stale.filter(
    (m) => API_FOOTBALL_LEAGUES.has(m.league as League) && /^\d+$/.test(m.externalId),
  );
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
    // 야구 리그 — api-football verify 불가. collector 가 score 는 넣었지만 status sync
    // 를 누락한 케이스 보강 (2026-05-28 #2218 KBO 5/26 종료인데 SCHEDULED 50h 방치).
    // 야구는 시작 +6h 면 무조건 종료/연기 → 점수가 들어와 있으면 FINISHED 로 정정.
    // 점수가 없으면 우천연기/미시작 가능성 → keep (destructive 회피, 안전).
    //   ※ ts- 야구 매치(NPB/LMB 등)는 mac-mini worker(stale-ts-verify)가 baseball diary 로
    //     status_id 까지 확인해 POSTPONED 확정 — Vercel 은 IP 화이트리스트로 TheSports 호출 불가.
    if (BASEBALL_LEAGUES.has(m.league as League)) {
      if (m.homeScore != null && m.awayScore != null) {
        await prisma.match.update({
          where: { id: m.id },
          data: { status: "FINISHED" },
        });
        verifiedFinished.push(m);
        continue;
      }
      verifyKept.push(m);
      continue;
    }
    // verify 응답 없음 — 외부 status 확인 실패. 임의 POSTPONED 금지, SCHEDULED 유지.
    // 2026-05-27 LMB/BUNDESLIGA_2/URVALSDEILD 일괄 false positive 재발 방지.
    // SOURCE_HINT 미등록 리그 (NBA/NHL 등) 도 동일하게 keep — destructive 봇은
    // 외부 verify 가 가능한 리그에만 POSTPONED 처리.
    //   ※ ts- (TheSports) 축구 매치(CANADA_PL/CHILE_PB 등)는 여기서 KEPT 로 두되,
    //     mac-mini worker(stale-ts-verify)가 football diary 로 별도 verify → FINISHED/POSTPONED.
    verifyKept.push(m);
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
      const src = BASEBALL_LEAGUES.has(m.league as League)
        ? "TheSports score"
        : `api-football ${v?.short ?? "?"}`;
      return `  [${tag}] ${m.league} | ${m.awayTeam.name} vs ${m.homeTeam.name} (${src})`;
    })
    .join("\n");

  // KEPT (상태 변경 없이 SCHEDULED 유지) sample. verify 불가 리그(ESPN/TheSports/esports)
  // 거나 외부 status 가 NS/TBD 라 안전하게 둔 매치. 같은 매치가 매 run 반복되면
  // = 영구 stuck → source/collector 점검 필요하므로 알림에 실제 목록을 노출한다.
  const keptLines = verifyKept
    .slice(0, 8)
    .map((m) => {
      const hrs = Math.round((Date.now() - m.startTime.getTime()) / 3600000);
      return `  ${m.league} | ${m.awayTeam.name} vs ${m.homeTeam.name} (${hrs}h, ${SOURCE_HINT[m.league] ?? "unknown"})`;
    })
    .join("\n");

  // Haiku 진단 — POSTPONED 처리된 매치가 있을 때만.
  // KEPT-only (전부 api-football verify 로 SCHEDULED 유지) 면 진단 프롬프트의
  // 리그별 카운트/샘플이 toPostpone 기반이라 빈 문자열 → Haiku 가 "데이터 없음" 응답.
  let diagnosis: string | null = null;
  if (toPostpone.length > 0) {
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
    diagnosis = await diagnoseWithHaiku(diagnosePrompt);
  }

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
          : "") +
        (correctedCount > 0
          ? `<b>verify 로 정정 (${correctedCount}건)</b>:\n<code>${correctedLines}</code>\n\n`
          : "") +
        // KEPT 매치 실제 목록. 과거엔 toPostpone===0 이면 "모두 정정됨" 을 무조건 출력해
        // 정정 0·KEPT 다수인 run 에서 거짓 안심을 줬다 → 유지된 매치를 그대로 보여준다.
        (verifyKept.length > 0
          ? `<b>SCHEDULED 유지 (${verifyKept.length}건 — verify 불가/미정, stuck 가능)</b>:\n<code>${keptLines}</code>\n\n`
          : "") +
        (toPostpone.length > 0
          ? diagnosis
            ? `🤖 <b>Haiku 진단</b>:\n${diagnosis}\n\n`
            : `<i>(ANTHROPIC_API_KEY 미설정 — Vercel env 등록 시 AI 진단 활성)</i>\n\n`
          : "") +
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
