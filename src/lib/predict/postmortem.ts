import { createHash } from "node:crypto";
import { SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";

export const POSTMORTEM_RULE_VERSION = "v1";

export const POSTMORTEM_CAUSE_LABELS: Record<string, string> = {
  CORRECT: "적중",
  DATA_GAP: "경기 전 데이터 부족",
  PERSONNEL_UNAVAILABLE_AT_PICK: "라인업·선발 확정 전 예측",
  PERSONNEL_CHANGED: "라인업·선발 변경",
  MARKET_MOVED_AGAINST: "마감 배당 역행",
  OVERCONFIDENT: "확률 과신",
  RED_CARD_EVENT: "퇴장 변수 동반",
  XG_RESULT_GAP: "경기력과 결과 불일치",
  MODEL_MISS: "모델 방향 오류",
};

type PersonnelKind = "LINEUP" | "STARTER" | "GOALIE" | "NONE";

interface PersonnelSummary {
  fingerprint: string;
  names: string[];
}

export interface PredictionContextData {
  schemaVersion: 1;
  league: string;
  startTime: string;
  capturedAt: string;
  leadHours: number;
  market: {
    homeProb: number | null;
    drawProb: number | null;
    awayProb: number | null;
    openingHomeProb: number | null;
    openingDrawProb: number | null;
    openingAwayProb: number | null;
    bookmakers: number | null;
    updatedAt: string | null;
    oddsHome: number | null;
    oddsDraw: number | null;
    oddsAway: number | null;
    oddsOver: number | null;
    oddsUnder: number | null;
    oddsHcHome: number | null;
    oddsHcAway: number | null;
  };
  personnel: {
    kind: PersonnelKind;
    home: PersonnelSummary | null;
    away: PersonnelSummary | null;
    updatedAt: string | null;
  };
  dataQuality: number;
  riskFlags: string[];
}

export interface PredictionContextMatch {
  league: string;
  startTime: Date;
  marketHome: number | null;
  marketDraw: number | null;
  marketAway: number | null;
  marketUpdatedAt: Date | null;
  marketBookmakers: number | null;
  openingMarketHome: number | null;
  openingMarketDraw: number | null;
  openingMarketAway: number | null;
  oddsHome: number | null;
  oddsDraw: number | null;
  oddsAway: number | null;
  oddsOver: number | null;
  oddsUnder: number | null;
  oddsHcHome: number | null;
  oddsHcAway: number | null;
  lineupHome: string | null;
  lineupAway: string | null;
  lineupUpdatedAt: Date | null;
  homeStarter: string | null;
  awayStarter: string | null;
  startersUpdatedAt: Date | null;
  homeGoalie: string | null;
  awayGoalie: string | null;
  goaliesUpdatedAt: Date | null;
}

interface PostmortemInput {
  correct: boolean;
  market: string;
  pick: string;
  prob: number;
  line: number | null;
  snapshot: PredictionContextData;
  finalContext: PredictionContextData;
  homeScore: number;
  awayScore: number;
  homeRed: number | null;
  awayRed: number | null;
  xgHome: number | null;
  xgAway: number | null;
}

export interface PostmortemResult {
  primaryCause: string;
  actionable: boolean;
  severity: "INFO" | "LOW" | "MED" | "HIGH";
  dataQuality: number;
  marketMovePp: number | null;
  evidence: Record<string, unknown>;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

function parsePersonnel(raw: string | null): PersonnelSummary | null {
  if (!raw) return null;
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 과거 데이터가 JSON 이 아니어도 원문 fingerprint 로 변화 여부는 비교할 수 있다.
  }

  const record = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;
  const names = new Set<string>();
  if (record) {
    const startXI = record.startXI;
    if (Array.isArray(startXI)) {
      for (const item of startXI) {
        if (typeof item === "string" && item.trim()) names.add(item.trim());
        if (item && typeof item === "object") {
          const row = item as Record<string, unknown>;
          const name = row.name ?? row.playerName;
          if (typeof name === "string" && name.trim()) names.add(name.trim());
        }
      }
    }
    const name = record.name ?? record.playerName;
    if (typeof name === "string" && name.trim()) names.add(name.trim());
  }

  const normalized = JSON.stringify(stableValue(parsed));
  return {
    fingerprint: createHash("sha256").update(normalized).digest("hex").slice(0, 16),
    names: Array.from(names).sort().slice(0, 20),
  };
}

function personnelFor(match: PredictionContextMatch): PredictionContextData["personnel"] {
  if (SOCCER_LEAGUES.has(match.league)) {
    return {
      kind: "LINEUP",
      home: parsePersonnel(match.lineupHome),
      away: parsePersonnel(match.lineupAway),
      updatedAt: match.lineupUpdatedAt?.toISOString() ?? null,
    };
  }
  if (["MLB", "KBO", "NPB"].includes(match.league)) {
    return {
      kind: "STARTER",
      home: parsePersonnel(match.homeStarter),
      away: parsePersonnel(match.awayStarter),
      updatedAt: match.startersUpdatedAt?.toISOString() ?? null,
    };
  }
  if (match.league === "NHL") {
    return {
      kind: "GOALIE",
      home: parsePersonnel(match.homeGoalie),
      away: parsePersonnel(match.awayGoalie),
      updatedAt: match.goaliesUpdatedAt?.toISOString() ?? null,
    };
  }
  return { kind: "NONE", home: null, away: null, updatedAt: null };
}

export function buildPredictionContext(
  match: PredictionContextMatch,
  capturedAt: Date,
): PredictionContextData {
  const personnel = personnelFor(match);
  const hasMarket = match.marketHome != null && match.marketAway != null &&
    (!SOCCER_LEAGUES.has(match.league) || match.marketDraw != null);
  const marketAgeHours = match.marketUpdatedAt
    ? Math.max(0, (capturedAt.getTime() - match.marketUpdatedAt.getTime()) / 3_600_000)
    : null;
  const hasOpening = match.openingMarketHome != null && match.openingMarketAway != null;
  const hasPersonnel = personnel.kind === "NONE" || (personnel.home != null && personnel.away != null);

  let dataQuality = 0;
  if (hasMarket) dataQuality += 40;
  if ((match.marketBookmakers ?? 0) >= 3) dataQuality += 10;
  else if ((match.marketBookmakers ?? 0) > 0) dataQuality += 5;
  if (hasOpening) dataQuality += 10;
  if (marketAgeHours != null && marketAgeHours <= 12) dataQuality += 15;
  else if (marketAgeHours != null && marketAgeHours <= 48) dataQuality += 8;
  if (hasPersonnel) dataQuality += 25;
  else if (personnel.home || personnel.away) dataQuality += 10;

  const riskFlags: string[] = [];
  if (!hasMarket) riskFlags.push("MARKET_MISSING");
  if ((match.marketBookmakers ?? 0) < 3) riskFlags.push("LOW_BOOKMAKER_COVERAGE");
  if (marketAgeHours == null || marketAgeHours > 12) riskFlags.push("STALE_MARKET");
  if (!hasPersonnel) riskFlags.push(`${personnel.kind}_NOT_AVAILABLE`);

  const leadHours = (match.startTime.getTime() - capturedAt.getTime()) / 3_600_000;
  if (leadHours > 24) riskFlags.push("EARLY_PREDICTION");

  return {
    schemaVersion: 1,
    league: match.league,
    startTime: match.startTime.toISOString(),
    capturedAt: capturedAt.toISOString(),
    leadHours: Number(leadHours.toFixed(1)),
    market: {
      homeProb: match.marketHome,
      drawProb: match.marketDraw,
      awayProb: match.marketAway,
      openingHomeProb: match.openingMarketHome,
      openingDrawProb: match.openingMarketDraw,
      openingAwayProb: match.openingMarketAway,
      bookmakers: match.marketBookmakers,
      updatedAt: match.marketUpdatedAt?.toISOString() ?? null,
      oddsHome: match.oddsHome,
      oddsDraw: match.oddsDraw,
      oddsAway: match.oddsAway,
      oddsOver: match.oddsOver,
      oddsUnder: match.oddsUnder,
      oddsHcHome: match.oddsHcHome,
      oddsHcAway: match.oddsHcAway,
    },
    personnel,
    dataQuality: Math.min(100, dataQuality),
    riskFlags,
  };
}

function fairTwoWay(first: number | null, second: number | null): [number, number] | null {
  if (first == null || second == null || first <= 1 || second <= 1) return null;
  const a = 1 / first;
  const b = 1 / second;
  const total = a + b;
  return [a / total, b / total];
}

function selectedMarketProb(
  context: PredictionContextData,
  market: string,
  pick: string,
): number | null {
  if (market === "1X2") {
    if (pick === "HOME") return context.market.homeProb;
    if (pick === "DRAW") return context.market.drawProb;
    if (pick === "AWAY") return context.market.awayProb;
    return null;
  }
  if (market === "OU") {
    const fair = fairTwoWay(context.market.oddsOver, context.market.oddsUnder);
    if (!fair) return null;
    return pick === "OVER" ? fair[0] : pick === "UNDER" ? fair[1] : null;
  }
  if (market === "HANDICAP") {
    const fair = fairTwoWay(context.market.oddsHcHome, context.market.oddsHcAway);
    if (!fair) return null;
    return pick === "HOME" ? fair[0] : pick === "AWAY" ? fair[1] : null;
  }
  return null;
}

function personnelChanged(before: PredictionContextData, after: PredictionContextData): boolean {
  if (before.personnel.kind === "NONE" || before.personnel.kind !== after.personnel.kind) return false;
  const pairs: Array<[PersonnelSummary | null, PersonnelSummary | null]> = [
    [before.personnel.home, after.personnel.home],
    [before.personnel.away, after.personnel.away],
  ];
  return pairs.some(([a, b]) => a && b && a.fingerprint !== b.fingerprint);
}

function personnelBecameAvailable(before: PredictionContextData, after: PredictionContextData): boolean {
  if (before.personnel.kind === "NONE" || before.personnel.kind !== after.personnel.kind) return false;
  const beforeReady = before.personnel.home != null && before.personnel.away != null;
  const afterReady = after.personnel.home != null && after.personnel.away != null;
  return !beforeReady && afterReady;
}

function xgSupportedPick(input: PostmortemInput): boolean {
  const { xgHome, xgAway, market, pick, line } = input;
  if (xgHome == null || xgAway == null) return false;
  if (market === "1X2") {
    const gap = xgHome - xgAway;
    if (pick === "HOME") return gap >= 0.5;
    if (pick === "AWAY") return gap <= -0.5;
    return pick === "DRAW" && Math.abs(gap) <= 0.25;
  }
  if (market === "OU" && line != null) {
    return pick === "OVER" ? xgHome + xgAway > line : xgHome + xgAway < line;
  }
  if (market === "HANDICAP" && line != null) {
    return pick === "HOME" ? xgHome + line > xgAway : xgHome + line < xgAway;
  }
  return false;
}

export function classifyPredictionPostmortem(input: PostmortemInput): PostmortemResult {
  const initialMarketProb = selectedMarketProb(input.snapshot, input.market, input.pick);
  const finalMarketProb = selectedMarketProb(input.finalContext, input.market, input.pick);
  const marketMovePp = initialMarketProb != null && finalMarketProb != null
    ? Number(((finalMarketProb - initialMarketProb) * 100).toFixed(2))
    : null;
  const modelMarketGapPp = initialMarketProb != null
    ? Number(((input.prob - initialMarketProb) * 100).toFixed(2))
    : null;
  const changed = personnelChanged(input.snapshot, input.finalContext);
  const unavailableAtPick = personnelBecameAvailable(input.snapshot, input.finalContext);
  const redCards = (input.homeRed ?? 0) + (input.awayRed ?? 0);
  const xgGap = xgSupportedPick(input);
  const flags = new Set(input.snapshot.riskFlags);

  if (unavailableAtPick) flags.add("PERSONNEL_UNAVAILABLE_AT_PICK");
  if (changed) flags.add("PERSONNEL_CHANGED");
  if (marketMovePp != null && marketMovePp <= -4) flags.add("MARKET_MOVED_AGAINST");
  if (modelMarketGapPp != null && modelMarketGapPp >= 12) flags.add("MODEL_MARKET_GAP");
  if (input.prob >= 0.65) flags.add("OVERCONFIDENT");
  if (redCards > 0) flags.add("RED_CARD_EVENT");
  if (xgGap) flags.add("XG_RESULT_GAP");

  let primaryCause = "CORRECT";
  let actionable = false;
  if (!input.correct) {
    if (input.snapshot.dataQuality < 50) {
      primaryCause = "DATA_GAP";
      actionable = true;
    } else if (unavailableAtPick && input.snapshot.leadHours <= 2) {
      primaryCause = "PERSONNEL_UNAVAILABLE_AT_PICK";
      actionable = true;
    } else if (changed) {
      primaryCause = "PERSONNEL_CHANGED";
      actionable = true;
    } else if (marketMovePp != null && marketMovePp <= -4) {
      primaryCause = "MARKET_MOVED_AGAINST";
      actionable = true;
    } else if (input.prob >= 0.65) {
      primaryCause = "OVERCONFIDENT";
      actionable = true;
    } else if (redCards > 0) {
      primaryCause = "RED_CARD_EVENT";
    } else if (xgGap) {
      primaryCause = "XG_RESULT_GAP";
    } else {
      primaryCause = "MODEL_MISS";
    }
  }

  const severity: PostmortemResult["severity"] = input.correct
    ? "INFO"
    : actionable && input.prob >= 0.65
      ? "HIGH"
      : actionable
        ? "MED"
        : "LOW";

  return {
    primaryCause,
    actionable,
    severity,
    dataQuality: input.snapshot.dataQuality,
    marketMovePp,
    evidence: {
      ruleVersion: POSTMORTEM_RULE_VERSION,
      flags: Array.from(flags),
      predicted: {
        pick: input.pick,
        probability: input.prob,
        line: input.line,
        leadHours: input.snapshot.leadHours,
      },
      market: {
        probabilityAtPick: initialMarketProb,
        probabilityAtClose: finalMarketProb,
        movePp: marketMovePp,
        modelGapPp: modelMarketGapPp,
        bookmakers: input.snapshot.market.bookmakers,
      },
      personnel: {
        kind: input.snapshot.personnel.kind,
        unavailableAtPick,
        changed,
        predictionUpdatedAt: input.snapshot.personnel.updatedAt,
        finalUpdatedAt: input.finalContext.personnel.updatedAt,
      },
      result: {
        homeScore: input.homeScore,
        awayScore: input.awayScore,
        homeRed: input.homeRed,
        awayRed: input.awayRed,
        xgHome: input.xgHome,
        xgAway: input.xgAway,
        xgSupportedPick: xgGap,
      },
    },
  };
}
