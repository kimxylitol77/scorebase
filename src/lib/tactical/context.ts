// 전술 분석 아티클용 매치 컨텍스트 조립 — 종료 경기 하나의 포메이션·xG·매치스탯 +
// Elo/폼/상대전적 프레이밍을 사람이 읽는 데이터 텍스트로 만든다. 프롬프트에 그대로 주입.
// 빈값(null)은 주입하지 않는다(창작 방지). 게이트 탈락 경기는 null 반환.

import { prisma } from "@/lib/db";
import { buildMatchContext } from "@/lib/predict/build-context";
import type { PredictMatch } from "@/lib/predict/types";
import { hasTacticalData, parseFormation, parseXg } from "./data-gate";

export interface TacticalContext {
  matchId: number;
  home: string;
  away: string;
  league: string;
  homeScore: number;
  awayScore: number;
  /** 프롬프트에 주입할 사람이 읽는 데이터 텍스트 */
  text: string;
}

/** 라인업 JSON 에서 감독명 추출 — coach 가 문자열이거나 {name} 객체인 두 형태 모두 대응. */
function parseCoach(lineupJson: string | null): string | null {
  if (!lineupJson) return null;
  try {
    const parsed = JSON.parse(lineupJson) as { coach?: string | { name?: string } | null };
    const c = parsed.coach;
    if (!c) return null;
    if (typeof c === "string") return c.trim() || null;
    return c.name?.trim() || null;
  } catch {
    return null;
  }
}

/** 라인업 JSON 에서 선발 11명 이름 배열 추출 (문자열 배열 형태). */
function parseStartXI(lineupJson: string | null): string[] {
  if (!lineupJson) return [];
  try {
    const parsed = JSON.parse(lineupJson) as { startXI?: unknown };
    const xi = parsed.startXI;
    if (Array.isArray(xi)) {
      return xi.filter((n): n is string => typeof n === "string" && n.trim().length > 0);
    }
  } catch {
    // 손상 JSON — 이름 없음
  }
  return [];
}

/**
 * matchId 하나로 전술 컨텍스트를 조립. 게이트(포메이션+xG) 미통과·매치 없음이면 null.
 */
export async function buildTacticalContext(matchId: number): Promise<TacticalContext | null> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      league: true,
      status: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      startTime: true,
      lineupHome: true,
      lineupAway: true,
      fixtureStats: true,
      matchStats: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });
  if (!match) return null;
  if (!hasTacticalData(match)) return null;
  if (match.homeScore == null || match.awayScore == null) return null;

  const home = match.homeTeam.name;
  const away = match.awayTeam.name;

  // Elo·폼·H2H 프레이밍 — 이 경기 직전 1년 window (match-brief 와 동일 파이프라인).
  const seasonMatches = await prisma.match.findMany({
    where: {
      league: match.league,
      startTime: {
        gte: new Date(match.startTime.getTime() - 365 * 24 * 3600 * 1000),
        lt: match.startTime,
      },
      status: "FINISHED",
      homeScore: { not: null },
      awayScore: { not: null },
    },
    select: {
      id: true,
      league: true,
      status: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      startTime: true,
      fixtureStats: true,
    },
  });
  const seasonTyped: PredictMatch[] = seasonMatches.map((m) => {
    const xg = parseXg(m.fixtureStats);
    const { fixtureStats: _fs, ...rest } = m;
    return { ...rest, xgHome: xg.home, xgAway: xg.away };
  });
  const ctx = buildMatchContext(
    seasonTyped,
    match.league,
    match.homeTeamId,
    match.awayTeamId,
    match.startTime,
    home,
    away,
  );

  const formH = parseFormation(match.lineupHome);
  const formA = parseFormation(match.lineupAway);
  const coachH = parseCoach(match.lineupHome);
  const coachA = parseCoach(match.lineupAway);
  const xiH = parseStartXI(match.lineupHome);
  const xiA = parseStartXI(match.lineupAway);
  const xg = parseXg(match.fixtureStats);
  const st = match.matchStats;

  const lines: string[] = [];
  lines.push(`[경기] ${home} ${match.homeScore} - ${match.awayScore} ${away} · ${match.league} (종료)`);

  // 포메이션 — 게이트 통과했으므로 양팀 모두 존재
  lines.push(
    `[포메이션] 홈 ${home} ${formH}${coachH ? ` (감독 ${coachH})` : ""} / 원정 ${away} ${formA}${coachA ? ` (감독 ${coachA})` : ""}`,
  );
  if (xiH.length) lines.push(`[홈 선발 XI] ${xiH.join(", ")}`);
  if (xiA.length) lines.push(`[원정 선발 XI] ${xiA.join(", ")}`);

  // xG — 게이트 통과했으므로 양팀 모두 존재. 실제 득점과 병기(마무리 효율 해석 재료).
  lines.push(`[xG] 홈 ${xg.home!.toFixed(2)} / 원정 ${xg.away!.toFixed(2)} (실제 ${match.homeScore} - ${match.awayScore})`);

  // 매치스탯 — 선택 항목. 있으면 주입.
  if (st) {
    if (st.homePossession != null && st.awayPossession != null)
      lines.push(`[점유율] 홈 ${st.homePossession}% / 원정 ${st.awayPossession}%`);
    if (st.homeShots != null && st.awayShots != null)
      lines.push(
        `[슈팅] 홈 ${st.homeShots}(유효 ${st.homeShotsOnTarget ?? "-"}) / 원정 ${st.awayShots}(유효 ${st.awayShotsOnTarget ?? "-"})`,
      );
    if (st.homeCorners != null && st.awayCorners != null)
      lines.push(`[코너] 홈 ${st.homeCorners} / 원정 ${st.awayCorners}`);
  }

  // 프레이밍 — Elo·폼·상대전적 (경기 직전 기준)
  if (ctx.elo) lines.push(`[Elo(경기 전)] 홈 ${Math.round(ctx.elo.home)} / 원정 ${Math.round(ctx.elo.away)}`);
  if (ctx.recentForm && (ctx.recentForm.home.length || ctx.recentForm.away.length))
    lines.push(
      `[최근 폼(W승 D무 L패)] 홈 ${ctx.recentForm.home.join("") || "-"} / 원정 ${ctx.recentForm.away.join("") || "-"}`,
    );
  if (ctx.h2h && ctx.h2h.total > 0)
    lines.push(
      `[상대전적] 홈 ${ctx.h2h.homeWins}승 ${ctx.h2h.draws}무 ${ctx.h2h.awayWins}패 (총 ${ctx.h2h.total}경기)`,
    );

  return {
    matchId: match.id,
    home,
    away,
    league: match.league,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    text: lines.join("\n"),
  };
}
