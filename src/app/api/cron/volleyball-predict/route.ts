// 배구 AI 예측 — Elo(자체) + bet365 임플라이드(시장) 블렌드 → Match.predHome/predAway.
// 매시간 Vercel cron. DB 만 읽으므로 Vercel 에서 직접 실행 가능 (TheSports 호출 없음).
//
// 모델: volleyball-elo.ts (티어 시드 + 세트차 MoV, 중립 코트, 무승부 없음 2-way).
// 블렌드: 시장 0.6 + Elo 0.4 (market-blend 사이트 표준 비율) — 프리매치 배당 없으면 Elo 100%.
// 백테스트(2026-06-12, 72경기): Elo 단독 83.3%·Brier 0.169 / 시장 66.7%·0.167 (21경기).
// 대상: SCHEDULED 매치만 — LIVE/FINISHED 는 예측 고정 (적중률 평가 왜곡 방지).
// ?dry=1 → 저장 없이 미리보기.

import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { VOLLEYBALL_LEAGUES } from "@/lib/sports/sport-leagues";
import { calcVolleyballElo, vbEloWinProb, type VbEloMatch } from "@/lib/predict/volleyball-elo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!authorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  const dry = new URL(req.url).searchParams.get("dry") === "1";

  try {
    const leagues = [...VOLLEYBALL_LEAGUES];
    const rows = await prisma.match.findMany({
      where: { league: { in: leagues } },
      select: {
        id: true, league: true, status: true, startTime: true,
        homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true,
        homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } },
      },
    });
    const eloMatches: VbEloMatch[] = rows.map((m) => ({
      league: m.league, status: m.status, startTime: m.startTime,
      homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId,
      homeScore: m.homeScore, awayScore: m.awayScore,
      homeTeamName: m.homeTeam.name, awayTeamName: m.awayTeam.name,
    }));
    const ratings = calcVolleyballElo(eloMatches);

    // 대상: 예정 매치 (지난 6시간 내 시작 포함 — cron 갭으로 미예측 상태로 시작된 경기 보정)
    const targets = rows.filter(
      (m) => m.status === "SCHEDULED" && m.startTime.getTime() > Date.now() - 6 * 3600 * 1000,
    );

    // 프리매치 배당 — 경기 시작 전 마지막 eu (bet365 우선)
    const oddsRows = targets.length
      ? await prisma.tsBaseballOddsHistory.findMany({
          where: { matchId: { in: targets.map((t) => t.id) }, kind: "eu" },
          select: { matchId: true, companyId: true, ts: true, v1: true, v2: true },
          orderBy: { ts: "asc" },
        })
      : [];

    let updated = 0;
    const sample: Array<{ id: number; vs: string; elo: number; market: number | null; pred: number }> = [];
    const updates: Array<{ id: number; data: Record<string, number | null> }> = [];
    for (const m of targets) {
      const pElo = vbEloWinProb(ratings, {
        league: m.league, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId,
        homeTeamName: m.homeTeam.name, awayTeamName: m.awayTeam.name,
      });
      const startSec = Math.floor(m.startTime.getTime() / 1000);
      const valid = oddsRows.filter((r) => r.matchId === m.id && r.ts <= startSec && r.v1 > 1 && r.v2 > 1);
      const b365 = valid.filter((r) => r.companyId === "2");
      const pick = (b365.length ? b365 : valid).at(-1);
      let pMarket: number | null = null;
      if (pick) {
        const ih = 1 / pick.v1;
        const ia = 1 / pick.v2;
        pMarket = ih / (ih + ia);
      }
      const pred = pMarket != null ? 0.6 * pMarket + 0.4 * pElo : pElo;
      updates.push({
        id: m.id,
        data: {
          predHome: pred,
          predAway: 1 - pred,
          predDraw: null,
          marketHome: pMarket,
          marketAway: pMarket != null ? 1 - pMarket : null,
        },
      });
      updated++;
      if (sample.length < 5) {
        sample.push({
          id: m.id,
          vs: `${m.homeTeam.name} vs ${m.awayTeam.name}`,
          elo: Math.round(pElo * 100),
          market: pMarket != null ? Math.round(pMarket * 100) : null,
          pred: Math.round(pred * 100),
        });
      }
    }

    // 직렬 103건 = 원격 DB 에서 maxDuration 초과 위험 → 10개 병렬 배치
    if (!dry) {
      const CHUNK = 10;
      for (let i = 0; i < updates.length; i += CHUNK) {
        await Promise.all(
          updates.slice(i, i + CHUNK).map((u) =>
            prisma.match.update({ where: { id: u.id }, data: u.data }),
          ),
        );
      }
    }

    return NextResponse.json({ ok: true, dry, leagues: leagues.length, targets: targets.length, updated, sample });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
