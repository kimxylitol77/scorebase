// sportspredictions.live 데이터 조회 — 스코어베이스 예측 컬럼(Match.pred*)·AiPrediction·accuracy-stats 를 영어 페이지용으로 정리.
// 새 계산은 없다. 숫자의 정의는 전부 src/lib/predict/* 를 따른다.
import { prisma } from "@/lib/db";
import { toEnglishTeamName } from "@/lib/i18n/en";
import { statForLeague, type LeagueStat } from "@/lib/predict/accuracy-stats";
import { strongPickThreshold } from "@/lib/predict/strong-pick";
import { predictedBeforeKickoff } from "@/lib/predict/scorecard-eligibility";
import { SP_LEAGUE_CODES, SP_LEAGUES, hasDraw } from "./leagues";
import { modelMeta, normModel } from "./models";

export type Side = "HOME" | "DRAW" | "AWAY";

export interface SpTeam {
  id: number;
  name: string;
  logo: string | null;
}

export interface SpMatch {
  id: number;
  league: string;
  externalId: string;
  startTime: string; // ISO
  status: string;
  home: SpTeam;
  away: SpTeam;
  homeScore: number | null;
  awayScore: number | null;
  probs: { home: number; draw: number | null; away: number } | null;
  pick: Side | null;
  pickProb: number | null;
  strong: boolean;
  correct: boolean | null;
  market: { home: number; draw: number | null; away: number } | null;
  valueGap: number | null;
  over: { prob: number; pick: string } | null;
  handicap: { line: number; pick: string; prob: number } | null;
}

const MATCH_SELECT = {
  id: true, league: true, externalId: true, startTime: true, status: true, homeScore: true, awayScore: true,
  predHome: true, predDraw: true, predAway: true, predWinner: true, predCorrect: true,
  marketHome: true, marketDraw: true, marketAway: true, valueGap: true,
  predOverProb: true, predOverPick: true, predHcLine: true, predHcPick: true, predHcProb: true,
  homeTeam: { select: { id: true, name: true, logoUrl: true } },
  awayTeam: { select: { id: true, name: true, logoUrl: true } },
} as const;

type Row = {
  id: number; league: string; externalId: string; startTime: Date; status: string;
  homeScore: number | null; awayScore: number | null;
  predHome: number | null; predDraw: number | null; predAway: number | null; predWinner: string | null; predCorrect: boolean | null;
  marketHome: number | null; marketDraw: number | null; marketAway: number | null; valueGap: number | null;
  predOverProb: number | null; predOverPick: string | null; predHcLine: number | null; predHcPick: string | null; predHcProb: number | null;
  homeTeam: { id: number; name: string; logoUrl: string | null };
  awayTeam: { id: number; name: string; logoUrl: string | null };
};

function toMatch(m: Row): SpMatch {
  const draw = hasDraw(m.league);
  const probs =
    m.predHome != null && m.predAway != null
      ? { home: m.predHome, draw: draw ? m.predDraw ?? 0 : null, away: m.predAway }
      : null;
  let pick: Side | null = null;
  let pickProb: number | null = null;
  if (probs) {
    const trio: [Side, number][] = [["HOME", probs.home], ["AWAY", probs.away]];
    if (probs.draw != null) trio.push(["DRAW", probs.draw]);
    trio.sort((a, b) => b[1] - a[1]);
    pick = (m.predWinner as Side | null) ?? trio[0][0];
    pickProb = trio.find((t) => t[0] === pick)?.[1] ?? trio[0][1];
  }
  const market =
    m.marketHome != null && m.marketAway != null
      ? { home: m.marketHome, draw: draw ? m.marketDraw ?? 0 : null, away: m.marketAway }
      : null;
  return {
    id: m.id,
    league: m.league,
    externalId: m.externalId,
    startTime: m.startTime.toISOString(),
    status: m.status,
    home: { id: m.homeTeam.id, name: toEnglishTeamName(m.homeTeam.name), logo: m.homeTeam.logoUrl },
    away: { id: m.awayTeam.id, name: toEnglishTeamName(m.awayTeam.name), logo: m.awayTeam.logoUrl },
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    probs,
    pick,
    pickProb,
    strong: pickProb != null && pickProb >= strongPickThreshold(m.league),
    correct: m.predCorrect,
    market,
    valueGap: m.valueGap,
    over: draw && m.predOverProb != null && m.predOverPick ? { prob: m.predOverProb, pick: m.predOverPick } : null,
    handicap:
      m.predHcLine != null && m.predHcPick && m.predHcProb != null
        ? { line: m.predHcLine, pick: m.predHcPick, prob: m.predHcProb }
        : null,
  };
}

const HOUR = 3600_000;

/** 예정 경기 + 예측 (지금부터 hours 시간 안). 예측 없는 경기는 뺀다. */
export async function fetchUpcoming(opts: { league?: string; hours?: number; take?: number } = {}): Promise<SpMatch[]> {
  const now = new Date();
  const rows = await prisma.match.findMany({
    where: {
      league: opts.league ? opts.league : { in: SP_LEAGUE_CODES },
      status: "SCHEDULED",
      startTime: { gte: new Date(now.getTime() - HOUR), lte: new Date(now.getTime() + (opts.hours ?? 48) * HOUR) },
      predHome: { not: null },
    },
    select: MATCH_SELECT,
    orderBy: { startTime: "asc" },
    take: opts.take ?? 60,
  });
  return rows.map(toMatch);
}

/** 채점 끝난 최근 경기 (적중 여부 표시용). */
export async function fetchRecentGraded(opts: { league?: string; take?: number } = {}): Promise<SpMatch[]> {
  const rows = await prisma.match.findMany({
    where: {
      league: opts.league ? opts.league : { in: SP_LEAGUE_CODES },
      status: "FINISHED",
      predCorrect: { not: null },
    },
    select: MATCH_SELECT,
    orderBy: { startTime: "desc" },
    take: opts.take ?? 12,
  });
  return rows.map(toMatch);
}

export async function fetchMatch(id: number): Promise<SpMatch | null> {
  if (!Number.isFinite(id)) return null;
  const row = await prisma.match.findFirst({ where: { id, league: { in: SP_LEAGUE_CODES } }, select: MATCH_SELECT });
  return row ? toMatch(row) : null;
}

export interface PanelPick {
  model: string;
  label: string;
  market: "1X2" | "HANDICAP" | "OU";
  pick: string;
  prob: number;
  line: number | null;
  correct: boolean | null;
  reason: string | null;
}

/** 한 경기에 대한 AI 패널(7모델) 픽 — 발행된 것·킥오프 전 예측만. */
export async function fetchPanelPicks(matchId: number): Promise<PanelPick[]> {
  const rows = await prisma.aiPrediction.findMany({
    where: { matchId, published: true, market: { in: ["1X2", "HANDICAP", "OU"] } },
    select: {
      model: true, market: true, pick: true, prob: true, line: true, correct: true, reason: true, predictedAt: true,
      match: { select: { startTime: true } },
    },
  });
  const seen = new Set<string>();
  const out: PanelPick[] = [];
  for (const r of rows) {
    if (!predictedBeforeKickoff(r)) continue;
    const model = normModel(r.model);
    const key = `${model}:${r.market}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      model, label: modelMeta(model).label, market: r.market as PanelPick["market"],
      pick: r.pick, prob: r.prob, line: r.line, correct: r.correct, reason: r.reason,
    });
  }
  const order = { "1X2": 0, HANDICAP: 1, OU: 2 } as const;
  return out.sort((a, b) => order[a.market] - order[b.market] || modelMeta(a.model).order - modelMeta(b.model).order);
}

export interface ModelRow {
  model: string;
  label: string;
  vendor: string;
  predicted: number;
  graded: number;
  correct: number;
  rate: number;
  oneXTwo: { graded: number; correct: number; rate: number };
  recent100: { graded: number; correct: number; rate: number };
}

/** 모델 리더보드 — /en/predictions/scorecard 와 같은 규칙(발행·킥오프 전·종료 경기만 채점). */
export async function fetchModelLeaderboard(): Promise<ModelRow[]> {
  const rows = await prisma.aiPrediction.findMany({
    where: { market: { in: ["1X2", "HANDICAP", "OU"] }, published: true },
    orderBy: { match: { startTime: "asc" } },
    select: {
      model: true, market: true, correct: true, predictedAt: true,
      match: { select: { id: true, startTime: true, status: true, homeScore: true, awayScore: true } },
    },
  });
  type Cell = { correct: boolean | null; market: string; t: number };
  const perModel = new Map<string, Map<string, Cell>>(); // model → (matchId:market) → cell
  for (const r of rows) {
    if (!predictedBeforeKickoff(r)) continue;
    const model = normModel(r.model);
    const graded = r.match.status === "FINISHED" && r.match.homeScore !== null && r.match.awayScore !== null;
    const correct = graded ? r.correct : null;
    let cells = perModel.get(model);
    if (!cells) { cells = new Map(); perModel.set(model, cells); }
    const key = `${r.match.id}:${r.market}`;
    const ex = cells.get(key);
    if (!ex || (ex.correct === null && correct !== null)) cells.set(key, { correct, market: r.market, t: r.match.startTime.getTime() });
  }
  const out: ModelRow[] = [];
  for (const [model, cells] of perModel) {
    const arr = [...cells.values()].sort((a, b) => a.t - b.t);
    const graded = arr.filter((c) => c.correct !== null);
    const correct = graded.filter((c) => c.correct).length;
    const x = arr.filter((c) => c.market === "1X2" && c.correct !== null);
    const xc = x.filter((c) => c.correct).length;
    const rec = graded.slice(-100);
    const rc = rec.filter((c) => c.correct).length;
    const meta = modelMeta(model);
    out.push({
      model, label: meta.label, vendor: meta.vendor,
      predicted: arr.length, graded: graded.length, correct,
      rate: graded.length ? correct / graded.length : 0,
      oneXTwo: { graded: x.length, correct: xc, rate: x.length ? xc / x.length : 0 },
      recent100: { graded: rec.length, correct: rc, rate: rec.length ? rc / rec.length : 0 },
    });
  }
  return out.sort((a, b) => b.rate - a.rate || modelMeta(a.model).order - modelMeta(b.model).order);
}

export interface LeagueAccuracy {
  code: string;
  name: string;
  stat: LeagueStat;
}

/** 리그별 스코어베이스 모델 적중률 — accuracy-stats.ts 단일 출처. */
export async function fetchLeagueAccuracy(): Promise<LeagueAccuracy[]> {
  const stats = await Promise.all(SP_LEAGUES.map((l) => statForLeague(l.code)));
  return SP_LEAGUES.map((l, i) => ({ code: l.code, name: l.name, stat: stats[i] })).filter((x) => x.stat.oneXTwo.evaluated > 0);
}
