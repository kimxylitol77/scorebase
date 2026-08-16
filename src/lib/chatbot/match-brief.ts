// 경기 하나의 예측·Elo·폼·상대전적·리그 적중률을 챗봇용 한국어 텍스트 브리핑으로 조립.
// 경기 챗봇 API 가 이 텍스트를 system 프롬프트에 주입한다(tool-use 대신 미리 주입 — 매치가 이미 확정이라 더 싸고 빠름).

import { prisma } from "@/lib/db";
import { buildMatchContext } from "@/lib/predict/build-context";
import { strongPickThreshold } from "@/lib/predict/strong-pick";
import { statForLeague } from "@/lib/predict/accuracy";
import { BASEBALL_LEAGUES } from "@/lib/sports/sport-leagues";
import { npbPlayerToKorean } from "@/lib/sports/npb-player-names";
import { toKoreanPlayerName } from "@/lib/player-names";
import type { PredictMatch } from "@/lib/predict/types";

const pct = (x: number) => Math.round(x * 100);

export interface MatchBrief {
  matchId: number;
  home: string;
  away: string;
  league: string;
  /** 챗봇 system 에 주입할, 사람이 읽는 텍스트 브리핑 */
  text: string;
}

/** matchId 하나로 경기 브리핑 텍스트를 조립. 매치 없으면 null. */
export async function buildMatchBrief(matchId: number): Promise<MatchBrief | null> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      league: true,
      homeTeamId: true,
      awayTeamId: true,
      startTime: true,
      status: true,
      homeScore: true,
      awayScore: true,
      predHome: true,
      predDraw: true,
      predAway: true,
      predWinner: true,
      predOverPick: true,
      predOverProb: true,
      predBttsPick: true,
      predBttsProb: true,
      predDcPick: true,
      predDcProb: true,
      marketHome: true,
      marketDraw: true,
      marketAway: true,
      homeStarter: true,
      awayStarter: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });
  if (!match) return null;

  const home = match.homeTeam.name;
  const away = match.awayTeam.name;

  // 시즌 매치 (predictMatchById 와 동일 1년 window) — Elo·폼·H2H 재계산용
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
    let xgHome: number | null = null;
    let xgAway: number | null = null;
    if (m.fixtureStats) {
      try {
        const fs = JSON.parse(m.fixtureStats) as { expectedGoals?: number }[];
        if (Array.isArray(fs) && fs.length === 2) {
          xgHome = fs[0]?.expectedGoals ?? null;
          xgAway = fs[1]?.expectedGoals ?? null;
        }
      } catch {
        // 손상 JSON — xG 없이 진행
      }
    }
    const { fixtureStats: _fs, ...rest } = m;
    return { ...rest, xgHome, xgAway };
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

  const acc = await statForLeague(match.league);

  // 데이터 있는 항목만 push (빈값 주입 금지 — preview 프롬프트 패턴 동일).
  const lines: string[] = [];
  lines.push(`경기: ${home} vs ${away} · ${match.league}`);

  // 1X2 예측 — persist 값(화면 위젯과 동일 소스)
  if (match.predHome != null && match.predDraw != null && match.predAway != null) {
    const top = Math.max(match.predHome, match.predDraw, match.predAway);
    const strong = top >= strongPickThreshold(match.league);
    const winnerName =
      match.predWinner === "HOME" ? home : match.predWinner === "AWAY" ? away : "무승부";
    lines.push(
      `예측(승/무/패): ${home} ${pct(match.predHome)}% / 무 ${pct(match.predDraw)}% / ${away} ${pct(match.predAway)}%`,
    );
    lines.push(
      `예측 픽: ${winnerName} (${pct(top)}%) — ${strong ? "Strong Pick(고신뢰)" : "Strong Pick 아님(박빙)"}`,
    );
  }

  // 야구 선발 투수 — KBO/MLB/NPB 는 선발이 승부의 최대 변수라 브리핑에 필수.
  // 이름은 리그별 음역 경로(NPB 한자·MLB 영문)를 태워 화면과 같은 표기로 준다.
  if (BASEBALL_LEAGUES.has(match.league)) {
    const starterLine = (raw: string | null, team: string): string | null => {
      if (!raw) return null;
      try {
        const s = JSON.parse(raw) as { name?: string; era?: number | null; whip?: number | null };
        if (!s?.name) return null;
        const name =
          match.league === "NPB" ? npbPlayerToKorean(s.name) : toKoreanPlayerName(s.name) || s.name;
        const stats = [
          s.era != null ? `ERA ${s.era}` : null,
          s.whip != null ? `WHIP ${s.whip}` : null,
        ].filter(Boolean);
        return `${team} ${name}${stats.length ? ` (${stats.join(", ")})` : ""}`;
      } catch {
        return null;
      }
    };
    const hs = starterLine(match.homeStarter, home);
    const as = starterLine(match.awayStarter, away);
    if (hs || as) lines.push(`선발 투수: ${[hs, as].filter(Boolean).join(" vs ")}`);
  }

  if (ctx.elo) {
    lines.push(`Elo: ${home} ${Math.round(ctx.elo.home)} / ${away} ${Math.round(ctx.elo.away)}`);
  }
  if (ctx.recentForm && (ctx.recentForm.home.length || ctx.recentForm.away.length)) {
    lines.push(
      `최근 폼(W승 D무 L패): ${home} ${ctx.recentForm.home.join("") || "-"} / ${away} ${ctx.recentForm.away.join("") || "-"}`,
    );
  }
  if (ctx.h2h && ctx.h2h.total > 0) {
    lines.push(
      `상대전적: ${home} ${ctx.h2h.homeWins}승 ${ctx.h2h.draws}무 ${ctx.h2h.awayWins}패 (총 ${ctx.h2h.total}경기)`,
    );
  }

  // 파생 시장 — persist 값
  if (match.predOverPick && match.predOverProb != null) {
    // 2.5 는 축구 기준선 — 야구는 리그별 합계 기준선이 달라 숫자를 못 박으면 오정보가 된다.
    const ouLabel = BASEBALL_LEAGUES.has(match.league) ? "오버/언더" : "오버/언더 2.5";
    lines.push(`${ouLabel}: ${match.predOverPick} (${pct(match.predOverProb)}%)`);
  }
  if (match.predBttsPick && match.predBttsProb != null) {
    lines.push(`양팀 득점(BTTS): ${match.predBttsPick} (${pct(match.predBttsProb)}%)`);
  }
  if (match.marketHome != null && match.marketDraw != null && match.marketAway != null) {
    lines.push(
      `시장 배당(implied): ${home} ${pct(match.marketHome)}% / 무 ${pct(match.marketDraw)}% / ${away} ${pct(match.marketAway)}%`,
    );
  }

  // 리그 적중률 — 챗봇이 "승률 나쁘던데" 류에 근거로 답할 재료
  if (acc.oneXTwo.evaluated > 0) {
    lines.push(
      `${match.league} 예측 적중률: 승무패 ${pct(acc.oneXTwo.rate)}% (${acc.oneXTwo.correct}/${acc.oneXTwo.evaluated}) · Strong Pick ${pct(acc.strong.rate)}% (${acc.strong.correct}/${acc.strong.evaluated}) · 최근10 ${pct(acc.recent10.rate)}%`,
    );
  }

  return {
    matchId: match.id,
    home,
    away,
    league: match.league,
    text: lines.join("\n"),
  };
}
