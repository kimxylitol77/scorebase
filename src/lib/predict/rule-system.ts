// /lab 조건식 시스템 빌더 — 조건 재료 목록, 경기별 as-of 피처 생성(시간순 단일 스캔), 조건 평가, 백테스트 채점.
// 전부 순수함수 — 서버(API 가 피처 생성)와 클라이언트(조건 바꿀 때마다 재채점)가 같은 코드를 쓴다.
import { settleFlatUnits, type FlatBet, type FlatRoiResult } from "@/lib/predict/flat-roi";

export type RuleSide = "HOME" | "DRAW" | "AWAY";
export type RuleOp = ">=" | "<=";

/** 조건에 쓸 수 있는 재료. 값은 전부 숫자, 없으면 null(조건 불충족). */
export const RULE_FIELDS = [
  { key: "oddsHome", label: "홈 승 배당", group: "배당", unit: "", step: 0.05, hint: "마감 기준 해외 평균 배당(마진 포함)" },
  { key: "oddsDraw", label: "무승부 배당", group: "배당", unit: "", step: 0.05, hint: "무승부 있는 종목만" },
  { key: "oddsAway", label: "원정 승 배당", group: "배당", unit: "", step: 0.05, hint: "마감 기준 해외 평균 배당(마진 포함)" },
  { key: "marketHome", label: "시장 홈 승률", group: "배당", unit: "%", step: 1, hint: "마진 제거 시장 확률" },
  { key: "marketAway", label: "시장 원정 승률", group: "배당", unit: "%", step: 1, hint: "마진 제거 시장 확률" },
  { key: "moveHome", label: "홈 시장 변동", group: "배당", unit: "%p", step: 1, hint: "오픈 대비 마감 시장 확률 변화(양수=홈으로 돈이 몰림)" },
  { key: "moveAway", label: "원정 시장 변동", group: "배당", unit: "%p", step: 1, hint: "오픈 대비 마감 시장 확률 변화" },
  { key: "modelHome", label: "모델 홈 승률", group: "AI 모델", unit: "%", step: 1, hint: "우리 모델 예측 확률" },
  { key: "modelAway", label: "모델 원정 승률", group: "AI 모델", unit: "%", step: 1, hint: "우리 모델 예측 확률" },
  { key: "edgeHome", label: "홈 모델−시장", group: "AI 모델", unit: "%p", step: 1, hint: "양수면 모델이 시장보다 홈을 높게 봄" },
  { key: "edgeAway", label: "원정 모델−시장", group: "AI 모델", unit: "%p", step: 1, hint: "양수면 모델이 시장보다 원정을 높게 봄" },
  { key: "hWin5", label: "홈팀 최근 5경기 승률", group: "홈팀 폼", unit: "%", step: 10, hint: "직전 5경기(3경기 미만이면 없음)" },
  { key: "hGf5", label: "홈팀 최근 5경기 득점", group: "홈팀 폼", unit: "/경기", step: 0.1, hint: "경기당 평균" },
  { key: "hGa5", label: "홈팀 최근 5경기 실점", group: "홈팀 폼", unit: "/경기", step: 0.1, hint: "경기당 평균" },
  { key: "hStreak", label: "홈팀 연승·연패", group: "홈팀 폼", unit: "", step: 1, hint: "+3 = 3연승, −3 = 3연패, 무승부면 0" },
  { key: "hRest", label: "홈팀 휴식일", group: "홈팀 폼", unit: "일", step: 1, hint: "직전 경기 후 지난 날수" },
  { key: "aWin5", label: "원정팀 최근 5경기 승률", group: "원정팀 폼", unit: "%", step: 10, hint: "직전 5경기(3경기 미만이면 없음)" },
  { key: "aGf5", label: "원정팀 최근 5경기 득점", group: "원정팀 폼", unit: "/경기", step: 0.1, hint: "경기당 평균" },
  { key: "aGa5", label: "원정팀 최근 5경기 실점", group: "원정팀 폼", unit: "/경기", step: 0.1, hint: "경기당 평균" },
  { key: "aStreak", label: "원정팀 연승·연패", group: "원정팀 폼", unit: "", step: 1, hint: "+3 = 3연승, −3 = 3연패" },
  { key: "aRest", label: "원정팀 휴식일", group: "원정팀 폼", unit: "일", step: 1, hint: "직전 경기 후 지난 날수" },
] as const;

export type RuleFieldKey = (typeof RULE_FIELDS)[number]["key"];
export const RULE_FIELD_KEYS: RuleFieldKey[] = RULE_FIELDS.map((f) => f.key);

export interface RuleCond {
  field: RuleFieldKey;
  op: RuleOp;
  value: number;
}

export interface RuleSystem {
  side: RuleSide;
  /** "ALL" 또는 리그 코드 */
  league: string;
  conds: RuleCond[];
}

export const MAX_CONDS = 5;
/** 이 밑이면 "표본 부족" — 우연한 고적중이 밖으로 퍼지지 않게 */
export const RULE_MIN_N = 20;

/** 한 경기의 조건 재료 + 채점 재료 */
export interface RuleFeature {
  matchId: number;
  /** 실제 결과 0=HOME 1=DRAW 2=AWAY (미종료 null) */
  res: 0 | 1 | 2 | null;
  /** 우리 모델 픽 적중 여부(기준선) — 미채점 null */
  modelHit: boolean | null;
  v: Record<RuleFieldKey, number | null>;
}

/** 와이어 포맷 — [matchId, res, modelHit(0/1/null), ...RULE_FIELD_KEYS 순서 값] */
export type RuleFeatureTuple = (number | null)[];

const r2 = (x: number | null) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);

export function ruleFeatureToTuple(f: RuleFeature): RuleFeatureTuple {
  return [f.matchId, f.res, f.modelHit == null ? null : f.modelHit ? 1 : 0, ...RULE_FIELD_KEYS.map((k) => r2(f.v[k]))];
}

export function ruleFeatureFromTuple(t: RuleFeatureTuple): RuleFeature {
  const v = {} as Record<RuleFieldKey, number | null>;
  RULE_FIELD_KEYS.forEach((k, i) => {
    v[k] = t[3 + i] ?? null;
  });
  return {
    matchId: t[0] as number,
    res: t[1] as 0 | 1 | 2 | null,
    modelHit: t[2] == null ? null : t[2] === 1,
    v,
  };
}

// ── as-of 피처 생성 ──

export interface RuleMatchInput {
  id: number;
  league: string;
  homeTeamId: number;
  awayTeamId: number;
  startTime: Date;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  /** 피처를 만들 대상인가(아니면 팀 상태 갱신용 히스토리) */
  target?: boolean;
  predHome?: number | null;
  predDraw?: number | null;
  predAway?: number | null;
  predCorrect?: boolean | null;
  marketHome?: number | null;
  marketAway?: number | null;
  openingMarketHome?: number | null;
  openingMarketAway?: number | null;
  oddsHome?: number | null;
  oddsDraw?: number | null;
  oddsAway?: number | null;
}

interface TeamGame {
  day: number;
  gf: number;
  ga: number;
  r: "W" | "D" | "L";
}

const DAY = 86_400_000;
const pct = (p: number | null | undefined) => (p == null ? null : p * 100);

/**
 * 경기들을 시간순으로 훑으며 대상 경기마다 "그 시점까지" 팀 폼을 스냅샷한다.
 * 종료·점수 있는 경기만 팀 상태를 갱신하므로 미래 정보가 새지 않는다.
 */
export function buildRuleFeatures(matches: RuleMatchInput[]): RuleFeature[] {
  const sorted = [...matches].sort((a, b) => a.startTime.getTime() - b.startTime.getTime() || a.id - b.id);
  const games = new Map<number, TeamGame[]>();
  const out: RuleFeature[] = [];

  const formOf = (teamId: number, day: number) => {
    const g = games.get(teamId) ?? [];
    const last5 = g.slice(-5);
    const enough = last5.length >= 3;
    let streak = 0;
    for (let i = g.length - 1; i >= 0; i--) {
      const r = g[i].r;
      if (r === "D") break;
      if (streak === 0) streak = r === "W" ? 1 : -1;
      else if ((streak > 0 && r === "W") || (streak < 0 && r === "L")) streak += Math.sign(streak);
      else break;
    }
    return {
      win5: enough ? (last5.filter((x) => x.r === "W").length / last5.length) * 100 : null,
      gf5: enough ? last5.reduce((a, x) => a + x.gf, 0) / last5.length : null,
      ga5: enough ? last5.reduce((a, x) => a + x.ga, 0) / last5.length : null,
      streak: g.length ? streak : null,
      rest: g.length ? day - g[g.length - 1].day : null,
    };
  };

  for (const m of sorted) {
    const day = Math.floor(m.startTime.getTime() / DAY);
    if (m.target) {
      const h = formOf(m.homeTeamId, day);
      const a = formOf(m.awayTeamId, day);
      const marketHome = pct(m.marketHome);
      const marketAway = pct(m.marketAway);
      const modelHome = pct(m.predHome);
      const modelAway = pct(m.predAway);
      const openH = pct(m.openingMarketHome);
      const openA = pct(m.openingMarketAway);
      const res: RuleFeature["res"] =
        m.status === "FINISHED" && m.homeScore != null && m.awayScore != null
          ? m.homeScore > m.awayScore
            ? 0
            : m.homeScore < m.awayScore
              ? 2
              : 1
          : null;
      out.push({
        matchId: m.id,
        res,
        modelHit: m.predCorrect ?? null,
        v: {
          oddsHome: m.oddsHome ?? null,
          oddsDraw: m.oddsDraw ?? null,
          oddsAway: m.oddsAway ?? null,
          marketHome,
          marketAway,
          moveHome: marketHome != null && openH != null ? marketHome - openH : null,
          moveAway: marketAway != null && openA != null ? marketAway - openA : null,
          modelHome,
          modelAway,
          edgeHome: modelHome != null && marketHome != null ? modelHome - marketHome : null,
          edgeAway: modelAway != null && marketAway != null ? modelAway - marketAway : null,
          hWin5: h.win5,
          hGf5: h.gf5,
          hGa5: h.ga5,
          hStreak: h.streak,
          hRest: h.rest,
          aWin5: a.win5,
          aGf5: a.gf5,
          aGa5: a.ga5,
          aStreak: a.streak,
          aRest: a.rest,
        },
      });
    }
    if (m.status === "FINISHED" && m.homeScore != null && m.awayScore != null) {
      const hr: TeamGame["r"] = m.homeScore > m.awayScore ? "W" : m.homeScore < m.awayScore ? "L" : "D";
      const ar: TeamGame["r"] = hr === "W" ? "L" : hr === "L" ? "W" : "D";
      (games.get(m.homeTeamId) ?? games.set(m.homeTeamId, []).get(m.homeTeamId)!).push({ day, gf: m.homeScore, ga: m.awayScore, r: hr });
      (games.get(m.awayTeamId) ?? games.set(m.awayTeamId, []).get(m.awayTeamId)!).push({ day, gf: m.awayScore, ga: m.homeScore, r: ar });
    }
  }
  return out;
}

// ── 조건 평가·채점 ──

export function matchesRules(f: RuleFeature, conds: RuleCond[]): boolean {
  for (const c of conds) {
    const x = f.v[c.field];
    if (x == null) return false;
    if (c.op === ">=" ? x < c.value : x > c.value) return false;
  }
  return true;
}

export interface RuleScore {
  n: number;
  hits: number;
  acc: number;
  roi: FlatRoiResult;
  /** 같은 경기들에서 우리 모델 픽 적중(기준선) */
  modelN: number;
  modelHits: number;
}

const SIDE_RES: Record<RuleSide, 0 | 1 | 2> = { HOME: 0, DRAW: 1, AWAY: 2 };
const SIDE_ODDS: Record<RuleSide, RuleFieldKey> = { HOME: "oddsHome", DRAW: "oddsDraw", AWAY: "oddsAway" };

function emptyScore(): RuleScore {
  return { n: 0, hits: 0, acc: 0, roi: settleFlatUnits([]), modelN: 0, modelHits: 0 };
}

/** 리그별 피처 묶음에 시스템을 적용 — 종료 경기만 채점. */
export function scoreRuleSystem(
  sets: Array<{ league: string; features: RuleFeature[] }>,
  system: RuleSystem,
): { total: RuleScore; byLeague: Record<string, RuleScore> } {
  const byLeague: Record<string, RuleScore> = {};
  const allBets: FlatBet[] = [];
  const total = emptyScore();
  for (const { league, features } of sets) {
    if (system.league !== "ALL" && system.league !== league) continue;
    const bets: FlatBet[] = [];
    const s = emptyScore();
    for (const f of features) {
      if (f.res == null || !matchesRules(f, system.conds)) continue;
      const won = f.res === SIDE_RES[system.side];
      s.n++;
      if (won) s.hits++;
      if (f.modelHit != null) {
        s.modelN++;
        if (f.modelHit) s.modelHits++;
      }
      bets.push({ odds: f.v[SIDE_ODDS[system.side]], won });
    }
    if (s.n === 0) continue;
    s.acc = s.hits / s.n;
    s.roi = settleFlatUnits(bets);
    byLeague[league] = s;
    total.n += s.n;
    total.hits += s.hits;
    total.modelN += s.modelN;
    total.modelHits += s.modelHits;
    allBets.push(...bets);
  }
  total.acc = total.n > 0 ? total.hits / total.n : 0;
  total.roi = settleFlatUnits(allBets);
  return { total, byLeague };
}
