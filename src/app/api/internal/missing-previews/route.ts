// GET /api/internal/missing-previews
// 다음 N일 SCHEDULED 매치 중 PREVIEW 글 없는 것 list.
// Bearer auth: INTERNAL_API_TOKEN.
//
// 야구 (KBO/NPB/MLB): 양 팀 선발투수 확정된 매치만 누락으로 카운트.
//   (정책: 야구는 투수 확정 후 PREVIEW 발행)
// 축구/기타: 모든 SCHEDULED 매치.
//
// PREVIEW_LEAGUES 화이트리스트만 — PREVIEW 자동발행 대상과 동일 기준.
//   (ARTICLE_LEAGUES 는 RECAP/ANALYSIS 용이라 NHL/WORLD_CUP/NPB 등 PREVIEW 미발행
//    리그까지 포함 → 누락 오탐. generate-previews 와 같은 PREVIEW_LEAGUES 로 일치시킴.)
//
// Query: ?days=2 (기본 2일 — generate-previews horizonDays 기본값과 일치)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { PREVIEW_LEAGUES, isUefaQualifierMatch } from "@/lib/sports/types";
import { BASEBALL_LEAGUES } from "@/lib/sports/sport-leagues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


function unauthorized(msg = "Unauthorized") {
  return NextResponse.json({ error: msg }, { status: 401 });
}

function parseStarterName(json: string | null | undefined): string | null {
  if (!json) return null;
  try {
    const obj = JSON.parse(json) as { name?: string };
    const n = obj?.name?.trim();
    return n && n.length > 0 ? n : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.INTERNAL_API_TOKEN}`;
  if (!process.env.INTERNAL_API_TOKEN) return unauthorized("INTERNAL_API_TOKEN unset");
  if (auth !== expected) return unauthorized();

  const url = new URL(req.url);
  // generate-previews 잡 horizon(기본 2일)과 일치 — 잡이 아직 만들지 않은 3일째 매치를
  // 누락으로 오탐하지 않도록. 봇도 days=2 로 호출.
  const days = Math.max(1, Math.min(7, Number(url.searchParams.get("days") ?? "2")));

  const now = new Date();
  const horizon = new Date(now.getTime() + days * 24 * 3600 * 1000);
  // 누락 알림 임계 — 킥오프 12시간 이내인데 PREVIEW 없을 때만 진짜 누락으로 카운트.
  // preview cron 은 하루 4회(최대 공백 8.5h)라 더 먼 미래 경기는 아직 cron 이 안 만든 정상 상태다.
  // (조회는 2일 유지 = total_scheduled 는 그대로, 누락 판정만 임박으로 좁혀 새벽 반복 오탐 차단)
  const imminentBefore = new Date(now.getTime() + 12 * 3600 * 1000);

  const rawMatches = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      startTime: { gte: now, lte: horizon },
      league: { in: [...PREVIEW_LEAGUES] },
    },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      // generate-previews 는 status 무관하게 type=PREVIEW 존재로 skip → 동일 기준.
      // (DRAFT/PENDING PREVIEW 가 있는 매치를 누락으로 오탐하지 않도록)
      articles: {
        where: { type: "PREVIEW" },
        select: { slug: true },
      },
    },
    orderBy: { startTime: "asc" },
  });
  // UEFA 여름 예선(7·8월 UCL/UEL/UECL) 제외 — PREVIEW 미발행 대상이라 generate-previews 와 동일 기준으로 누락 오탐 방지.
  const matches = rawMatches.filter((m) => !isUefaQualifierMatch(m.league, m.startTime));

  const missing: Array<{
    matchId: number;
    league: string;
    homeName: string;
    awayName: string;
    startTime: string;
    homeStarter: string | null;
    awayStarter: string | null;
    reason: "no_preview" | "baseball_starter_pending";
  }> = [];

  for (const m of matches) {
    const hasPreview = m.articles.length > 0;
    if (hasPreview) continue;
    // 킥오프 임박(12h 이내)만 누락 카운트 — 더 먼 미래 경기는 다음 preview cron 이 생성 예정(오탐 방지).
    if (m.startTime > imminentBefore) continue;

    if (BASEBALL_LEAGUES.has(m.league)) {
      // 야구: 양 팀 투수 확정 시에만 누락 카운트
      const homeStarter = parseStarterName(m.homeStarter);
      const awayStarter = parseStarterName(m.awayStarter);
      const bothConfirmed = !!homeStarter && !!awayStarter;
      if (!bothConfirmed) {
        // 정책상 정상 — skip
        continue;
      }
      missing.push({
        matchId: m.id,
        league: m.league,
        homeName: m.homeTeam.name,
        awayName: m.awayTeam.name,
        startTime: m.startTime.toISOString(),
        homeStarter,
        awayStarter,
        reason: "no_preview",
      });
    } else {
      missing.push({
        matchId: m.id,
        league: m.league,
        homeName: m.homeTeam.name,
        awayName: m.awayTeam.name,
        startTime: m.startTime.toISOString(),
        homeStarter: null,
        awayStarter: null,
        reason: "no_preview",
      });
    }
  }

  // ── 자가치유 — 알리기 전에 preview cron 을 재실행한다 (content-quality 라우트와 같은 원칙).
  //    실측(8/15~18): 누락 알림 후 다음 preview cron(하루 4회)이 돌면 "모두 해소" — 치유법이
  //    이미 존재하는 멱등 cron 재실행이라 기계가 먼저 시도하고, 2회 실패분만 사람에게 간다.
  //    Elo 게이트 등 "정책상 미발행" 매치가 원인이면 재실행으로 안 낫는데, 그때 상한 소진 →
  //    기존과 동일하게 알림이 통과하는 것이 의도된 동작이다(무한 재시도 금지).
  //    봇(preview-coverage.js)은 missing 배열만 보므로 치유 중엔 비워서 알림을 억제하고,
  //    판정은 다음 30분 폴이 한다. 봇 무변경 — Vercel 배포 즉시 적용.
  let healing = false;
  if (missing.length > 0) {
    const HEAL_KEY = "preview-missing";
    const attempts = await prisma.healthCheck.count({
      where: { category: "self-heal", key: HEAL_KEY, runAt: { gte: new Date(now.getTime() - 6 * 3600_000) } },
    });
    if (attempts < 2) {
      // 트리거만 하고 완주를 기다리지 않는다(preview cron 최대 300s) — 판정은 다음 폴.
      const site = (process.env.SITE_URL || "https://www.scorebase.kr").replace("://scorebase.kr", "://www.scorebase.kr");
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8_000);
      let result = "triggered";
      try {
        const res = await fetch(`${site}/api/cron/preview`, {
          headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
          signal: ctrl.signal,
          cache: "no-store",
        });
        if (!res.ok) result = `fail:${res.status}`;
      } catch (e) {
        if ((e as Error).name !== "AbortError") result = "fail:net";
      } finally {
        clearTimeout(t);
      }
      try {
        await prisma.healthCheck.create({
          data: {
            severity: "LOW",
            category: "self-heal",
            key: HEAL_KEY,
            message: `preview ${result === "triggered" ? "트리거" : "호출 실패"} (누락 ${missing.length}건 · 시도 ${attempts + 1}/2) — 판정은 다음 봇 폴`,
          },
        });
      } catch {
        /* 기록 실패가 검사를 막지 않는다 */
      }
      healing = result === "triggered";
    }
  }

  // baseball 투수 미확정 (정상 skip) 도 카운트 (참고용)
  const baseballStarterPending: Array<{ matchId: number; league: string; awayName: string; homeName: string; startTime: string }> = [];
  for (const m of matches) {
    if (!BASEBALL_LEAGUES.has(m.league)) continue;
    if (m.articles.length > 0) continue;
    const home = parseStarterName(m.homeStarter);
    const away = parseStarterName(m.awayStarter);
    if (!home || !away) {
      baseballStarterPending.push({
        matchId: m.id,
        league: m.league,
        awayName: m.awayTeam.name,
        homeName: m.homeTeam.name,
        startTime: m.startTime.toISOString(),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    days,
    total_scheduled: matches.length,
    // 치유 중엔 봇 알림 억제 — 실 누락 목록은 healing_missing 으로 보존(관찰용)
    missing_count: healing ? 0 : missing.length,
    baseball_starter_pending_count: baseballStarterPending.length,
    missing: healing ? [] : missing,
    healing,
    healing_missing: healing ? missing : undefined,
    baseball_starter_pending: baseballStarterPending,
  });
}
