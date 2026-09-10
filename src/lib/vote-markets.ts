// 승부예측 투표 시장(1X2·핸디캡·오버언더) 단일 소스 — 라인 결정·픽 검증·라벨·채점·픽 배당.
// API 라우트·투표 카드·/picks·채점 잡이 전부 여기만 본다(각자 규칙을 두면 채점과 화면이 어긋난다).
import { getSportProfile, handicapCorrect, overActual } from "@/lib/predict/markets";

export type VoteMarket = "1X2" | "HANDICAP" | "OU";
export const VOTE_MARKETS: readonly VoteMarket[] = ["1X2", "HANDICAP", "OU"];
export const MARKET_LABEL: Record<VoteMarket, string> = { "1X2": "승부", HANDICAP: "핸디캡", OU: "오버언더" };

const PICKS_BY_MARKET: Record<VoteMarket, readonly string[]> = {
  "1X2": ["home", "draw", "away"],
  HANDICAP: ["home", "away"],
  OU: ["over", "under"],
};

export function isVoteMarket(v: unknown): v is VoteMarket {
  return v === "1X2" || v === "HANDICAP" || v === "OU";
}
export function isValidPick(market: VoteMarket, pick: string): boolean {
  return PICKS_BY_MARKET[market].includes(pick);
}

/** 라인 결정에 필요한 Match 필드 — 호출부가 select 해서 넘긴다. */
export interface LineSource {
  league: string;
  predHcLine: number | null;
  oddsHcLine: number | null;
  oddsTotalLine: number | null;
}

/**
 * 시장별 라인 — 서버가 단일 결정(클라이언트 값 신뢰 안 함).
 * HANDICAP: 모델 라인 → 시장 라인 절대값 → 종목 프로필. OU: 시장 총점선 → 종목 프로필.
 * 프로필 없는 리그(월드컵·컵 등)는 null = 그 시장 투표 없음.
 */
export function resolveLines(m: LineSource): { HANDICAP: number | null; OU: number | null } {
  const profile = getSportProfile(m.league);
  const hc =
    m.predHcLine != null && m.predHcLine > 0
      ? m.predHcLine
      : m.oddsHcLine != null && m.oddsHcLine !== 0
        ? Math.abs(m.oddsHcLine)
        : (profile?.handicapLine ?? null);
  const ou = m.oddsTotalLine != null && m.oddsTotalLine > 0 ? m.oddsTotalLine : (profile?.overLine ?? null);
  return { HANDICAP: profile ? hc : null, OU: profile ? ou : null };
}

/** 픽 표시 라벨 — 팀명과 라인을 붙인 사람용 문구. */
export function pickLabel(market: VoteMarket, pick: string, home: string, away: string, line: number | null): string {
  if (market === "HANDICAP") {
    const l = line != null ? ` ${pick === "home" ? "−" : "+"}${line}` : "";
    return `${pick === "home" ? home : away}${l}`;
  }
  if (market === "OU") return `${pick === "over" ? "오버" : "언더"}${line != null ? ` ${line}` : ""}`;
  return pick === "home" ? home : pick === "away" ? away : "무승부";
}

/** 종료 스코어로 정답 픽 — 시장별. 핸디캡은 라인 정확히 걸치면(margin==line) null(무효). */
export function resultPick(market: VoteMarket, line: number | null, homeScore: number, awayScore: number): string | null {
  if (market === "1X2") return homeScore > awayScore ? "home" : homeScore < awayScore ? "away" : "draw";
  if (line == null) return null;
  if (market === "HANDICAP") {
    if (homeScore - awayScore === line) return null; // push
    return handicapCorrect("HOME", line, homeScore, awayScore) ? "home" : "away";
  }
  if (homeScore + awayScore === line) return null;
  return overActual(homeScore, awayScore, line) === "OVER" ? "over" : "under";
}

/** 투표 시점 픽 배당(CLV·수익 시뮬 재료). 시장 라인과 우리 라인이 같을 때만 핸디/OU 배당을 인정. */
export function pickOddsOf(
  market: VoteMarket,
  pick: string,
  line: number | null,
  m: { oddsHome: number | null; oddsDraw: number | null; oddsAway: number | null; oddsHcLine: number | null; oddsHcHome: number | null; oddsHcAway: number | null; oddsTotalLine: number | null; oddsOver: number | null; oddsUnder: number | null },
): number | null {
  if (market === "1X2") return pick === "home" ? m.oddsHome : pick === "draw" ? m.oddsDraw : m.oddsAway;
  if (market === "HANDICAP") {
    if (line == null || m.oddsHcLine == null || Math.abs(m.oddsHcLine) !== line) return null;
    return pick === "home" ? m.oddsHcHome : m.oddsHcAway;
  }
  if (line == null || m.oddsTotalLine !== line) return null;
  return pick === "over" ? m.oddsOver : m.oddsUnder;
}

/** AI 픽(모델) — 시장별 pick·확률. 없으면 null. */
export function aiPickOf(
  market: VoteMarket,
  m: { predHome: number | null; predDraw: number | null; predAway: number | null; predHcPick: string | null; predHcProb: number | null; predOverPick: string | null; predOverProb: number | null },
): { pick: string; prob: number } | null {
  if (market === "1X2") {
    if (m.predHome == null || m.predAway == null) return null;
    const cands: [string, number][] = [["home", m.predHome], ["away", m.predAway]];
    if (m.predDraw != null) cands.push(["draw", m.predDraw]);
    cands.sort((a, b) => b[1] - a[1]);
    return { pick: cands[0][0], prob: cands[0][1] };
  }
  if (market === "HANDICAP") {
    if (!m.predHcPick || m.predHcProb == null) return null;
    return { pick: m.predHcPick === "HOME" ? "home" : "away", prob: m.predHcProb };
  }
  if (!m.predOverPick || m.predOverProb == null) return null;
  const over = m.predOverPick === "OVER";
  return { pick: over ? "over" : "under", prob: over ? m.predOverProb : 1 - m.predOverProb };
}
