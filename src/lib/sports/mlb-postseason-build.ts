// MLB 포스트시즌 대진표 모델 — 공식 statsapi 순위표(시드)와 포스트시즌 시리즈 뼈대(자리표시자 포함)를 한 모델로.
// 네트워크·DB 없는 순수 함수(테스트 대상). 조회·캐시는 mlb-postseason.ts.
// 규칙(2022~ 12팀 체제): 리그별 지구 우승 3팀이 승률순 1~3번, 와일드카드 3팀이 4~6번 시드.
// 1·2번 시드는 와일드카드 시리즈 부전승. WC(3전) 3v6·4v5 → DS(5전) 1 vs 4/5 승자·2 vs 3/6 승자 → LCS(7전) → WS(7전).

export type MlbRound = "wc" | "ds" | "lcs" | "ws";
export type League = "AL" | "NL";

export const ROUND_LABEL: Record<MlbRound, string> = {
  wc: "와일드카드",
  ds: "디비전 시리즈",
  lcs: "챔피언십 시리즈",
  ws: "월드시리즈",
};
export const ROUND_SHORT: Record<MlbRound, string> = { wc: "WC", ds: "DS", lcs: "LCS", ws: "WS" };
const ROUND_BY_TYPE: Record<string, MlbRound> = { F: "wc", D: "ds", L: "lcs", W: "ws" };
const BEST_OF: Record<MlbRound, number> = { wc: 3, ds: 5, lcs: 7, ws: 7 };
/** 상위 시드 기준 홈 순서 — WC 는 3경기 모두 상위 시드 홈, DS 2-2-1, LCS·WS 2-3-2 */
const HOME_PATTERN: Record<MlbRound, string> = { wc: "HHH", ds: "HHAAH", lcs: "HHAAAHH", ws: "HHAAAHH" };

// ── statsapi 원본 모양(쓰는 필드만) ──
export interface ApiTeamRef {
  id: number;
  name: string;
  abbreviation?: string;
  teamName?: string;
  placeholder?: boolean;
  league?: { id: number };
}
export interface ApiStandingTeam {
  team: ApiTeamRef;
  wins: number;
  losses: number;
  winningPercentage: string;
  divisionRank?: string;
  wildCardRank?: string | null;
  wildCardGamesBack?: string;
  clinchIndicator?: string | null;
  divisionLeader?: boolean;
}
export interface ApiStandingRecord {
  league: { id: number };
  division: { id: number };
  teamRecords: ApiStandingTeam[];
}
export interface ApiGame {
  gamePk: number;
  /** "AL Wild Card Series" 등 — 자리표시자끼리의 시리즈도 리그를 알 수 있는 유일한 필드 */
  seriesDescription?: string;
  gameDate: string;
  officialDate?: string;
  status: { abstractGameState?: string; detailedState?: string; startTimeTBD?: boolean };
  ifNecessary?: string;
  teams: {
    home: { team: ApiTeamRef; score?: number; isWinner?: boolean };
    away: { team: ApiTeamRef; score?: number; isWinner?: boolean };
  };
}
export interface ApiSeries {
  series: { id: string; gameType: string };
  games: ApiGame[];
}

// ── 모델 ──
export interface PsTeam {
  /** statsapi 팀 id — 자리표시자는 null */
  id: number | null;
  /** 화면 이름(한글). 자리표시자는 "시카고W/클리블랜드"·"3·6 승자" 같은 설명 */
  name: string;
  abbr: string;
  seed: number | null;
  placeholder: boolean;
  /** 자리표시자 자리를 현재 순위 시드로 채운 팀 — 화면에 "예상" */
  projected: boolean;
  /** 채우기 전 원래 자리표시자 설명(후보 팀 등) — projected 일 때만 */
  slotNote: string | null;
  /** 이 팀에 뛰는 한국 선수(한글 이름) */
  korea: string[];
}
export interface PsGame {
  pk: number;
  /** ISO. 시간 미정이면 날짜만 의미 있음 */
  date: string;
  officialDate: string | null;
  tbd: boolean;
  state: "SCHEDULED" | "LIVE" | "FINAL";
  ifNecessary: boolean;
  homeId: number | null;
  homeScore: number | null;
  awayScore: number | null;
  winnerId: number | null;
}
export interface PsSeries {
  id: string;
  round: MlbRound;
  league: League | null;
  bestOf: number;
  /** 상위 시드(홈 어드밴티지 쪽) */
  top: PsTeam;
  bottom: PsTeam;
  winsTop: number;
  winsBottom: number;
  state: "SCHEDULED" | "LIVE" | "FINAL";
  /** 결판 났으면 승자 id */
  winnerId: number | null;
  games: PsGame[];
  /** 상위 시드의 시리즈 승리 확률(자체 Elo) — 두 팀 다 정해졌고 결판 전일 때만 */
  probTop: number | null;
}
export interface SeedRow {
  seed: number;
  id: number;
  name: string;
  abbr: string;
  wins: number;
  losses: number;
  /** 확정 상태 한글 — 없으면 null(아직 경쟁 중) */
  status: string | null;
  divisionWinner: boolean;
}
export interface ChaseRow {
  id: number;
  name: string;
  wins: number;
  losses: number;
  /** 와일드카드 마지막 자리와의 경기 차 */
  gamesBack: string;
}
export interface MlbPostseason {
  season: number;
  seeds: Record<League, SeedRow[]>;
  chase: Record<League, ChaseRow[]>;
  series: PsSeries[];
  /** 12팀이 전부 확정됐는지 — 아니면 화면에 "현재 순위 기준 예상" */
  fieldSet: boolean;
  champion: PsTeam | null;
}

const LEAGUE_OF: Record<number, League> = { 103: "AL", 104: "NL" };

const CLINCH_LABEL: Record<string, string> = {
  z: "부전승 확정",
  y: "지구 우승 확정",
  x: "진출 확정",
  w: "와일드카드 확정",
};

/** 리그별 시드 1~6 — 지구 1위 3팀 승률순 1~3, 와일드카드 1~3위가 4~6 (statsapi 의 타이브레이크 순위 그대로). */
export function computeSeeds(
  records: ApiStandingRecord[],
  nameOf: (t: ApiTeamRef) => string,
): { seeds: Record<League, SeedRow[]>; chase: Record<League, ChaseRow[]> } {
  const seeds: Record<League, SeedRow[]> = { AL: [], NL: [] };
  const chase: Record<League, ChaseRow[]> = { AL: [], NL: [] };
  for (const lg of ["AL", "NL"] as const) {
    const teams = records.filter((r) => LEAGUE_OF[r.league.id] === lg).flatMap((r) => r.teamRecords);
    const pct = (t: ApiStandingTeam) => Number(t.winningPercentage) || 0;
    const leaders = teams.filter((t) => t.divisionRank === "1").sort((a, b) => pct(b) - pct(a)).slice(0, 3);
    const wild = teams
      .filter((t) => t.wildCardRank && Number(t.wildCardRank) >= 1)
      .sort((a, b) => Number(a.wildCardRank) - Number(b.wildCardRank));
    const row = (t: ApiStandingTeam, seed: number, divisionWinner: boolean): SeedRow => ({
      seed,
      id: t.team.id,
      name: nameOf(t.team),
      abbr: t.team.abbreviation ?? "",
      wins: t.wins,
      losses: t.losses,
      status: t.clinchIndicator ? (CLINCH_LABEL[t.clinchIndicator] ?? null) : null,
      divisionWinner,
    });
    seeds[lg] = [...leaders.map((t, i) => row(t, i + 1, true)), ...wild.slice(0, 3).map((t, i) => row(t, i + 4, false))];
    chase[lg] = wild.slice(3, 5).map((t) => ({
      id: t.team.id,
      name: nameOf(t.team),
      wins: t.wins,
      losses: t.losses,
      gamesBack: t.wildCardGamesBack ?? "-",
    }));
  }
  return { seeds, chase };
}

/**
 * 자리표시자 팀 이름 한글화 — "CWS/CLE"(후보 두 팀), "AL 3/6 Winner", "NL Wild Card #3", "AL Higher Seed" 등.
 * 카드 폭(168px)에 들어가게 짧게 — "3·6 승자"·"상위 시드"·"리그 챔피언".
 * @param nameByAbbr 순위표에서 만든 약어 → 한글 팀명
 */
export function placeholderName(raw: string, nameByAbbr: Map<string, string>): string {
  // 리그 접두(AL/NL)는 붙이지 않는다 — 트리 열과 모바일 묶음 제목이 이미 리그를 말하고, 좁은 카드에서 이름을 잘라먹는다
  let m = /^(AL|NL) (\d)\/(\d) Winner$/.exec(raw);
  if (m) return `${m[2]}·${m[3]} 승자`;
  m = /^(AL|NL) Wild Card #(\d)$/.exec(raw);
  if (m) return `와일드카드 ${m[2]}위`;
  if (/League Champion/i.test(raw)) return "리그 챔피언";
  if (/Higher Seed/i.test(raw)) return `상위 시드`;
  if (/Lower Seed/i.test(raw)) return `하위 시드`;
  if (/^[A-Z]{2,3}(\/[A-Z]{2,3})+$/.test(raw)) {
    return raw
      .split("/")
      .map((a) => nameByAbbr.get(a) ?? a)
      .join("/");
  }
  return raw;
}

/** 경기당 승률 p(상위 시드 홈)·q(상위 시드 원정)에서 N전 M선승 시리즈 승리 확률 — 홈 순서 반영 DP. */
export function seriesWinProb(round: MlbRound, pHome: number, pAway: number, winsTop = 0, winsBottom = 0): number {
  const need = Math.ceil(BEST_OF[round] / 2);
  const pattern = HOME_PATTERN[round];
  const memo = new Map<string, number>();
  const go = (a: number, b: number): number => {
    if (a >= need) return 1;
    if (b >= need) return 0;
    const key = `${a},${b}`;
    const hit = memo.get(key);
    if (hit != null) return hit;
    const p = pattern[a + b] === "H" ? pHome : pAway;
    const v = p * go(a + 1, b) + (1 - p) * go(a, b + 1);
    memo.set(key, v);
    return v;
  };
  return go(winsTop, winsBottom);
}

/** MLB 경기당 홈 어드밴티지(Elo) — 홈 승률 약 53.5%(MLB 장기 평균)에 맞춘 값. 리그 공용 100 은 야구에 과하다. */
export const MLB_SERIES_HOME_ELO = 24;
const expected = (ra: number, rb: number) => 1 / (1 + Math.pow(10, (rb - ra) / 400));

export interface BuildOptions {
  /** statsapi 팀 → 한글 팀명 */
  nameOf: (t: ApiTeamRef) => string;
  /** statsapi 팀 id → 자체 Elo(없으면 null — 확률 생략) */
  eloOf: (teamId: number) => number | null;
  /** statsapi 팀 id → 한국 선수 한글 이름들 */
  koreaOf: (teamId: number) => string[];
}

function gameState(g: ApiGame): PsGame["state"] {
  const s = g.status.abstractGameState;
  if (s === "Final") return "FINAL";
  if (s === "Live") return "LIVE";
  return "SCHEDULED";
}

export function buildMlbPostseason(
  season: number,
  records: ApiStandingRecord[],
  apiSeries: ApiSeries[],
  opts: BuildOptions,
): MlbPostseason {
  const { seeds, chase } = computeSeeds(records, opts.nameOf);
  const seedOf = new Map<number, number>();
  for (const lg of ["AL", "NL"] as const) for (const s of seeds[lg]) seedOf.set(s.id, s.seed);
  const nameByAbbr = new Map<string, string>();
  for (const r of records) for (const t of r.teamRecords) if (t.team.abbreviation) nameByAbbr.set(t.team.abbreviation, opts.nameOf(t.team));

  const team = (t: ApiTeamRef): PsTeam => {
    const placeholder = t.placeholder === true;
    return {
      id: placeholder ? null : t.id,
      name: placeholder ? placeholderName(t.name, nameByAbbr) : opts.nameOf(t),
      abbr: t.abbreviation ?? "",
      seed: placeholder ? null : (seedOf.get(t.id) ?? null),
      placeholder,
      projected: false,
      slotNote: null,
      korea: placeholder ? [] : opts.koreaOf(t.id),
    };
  };

  const series: PsSeries[] = [];
  for (const s of apiSeries) {
    const round = ROUND_BY_TYPE[s.series.gameType];
    if (!round || s.games.length === 0) continue;
    const first = s.games[0];
    // 상위 시드 = 1차전 홈(statsapi 는 상위 시드를 홈에 둔다)
    const topRef = first.teams.home.team;
    const bottomRef = first.teams.away.team;
    const top = team(topRef);
    const bottom = team(bottomRef);
    const games: PsGame[] = s.games.map((g) => {
      const st = gameState(g);
      const winner = g.teams.home.isWinner ? g.teams.home.team.id : g.teams.away.isWinner ? g.teams.away.team.id : null;
      return {
        pk: g.gamePk,
        date: g.gameDate,
        officialDate: g.officialDate ?? null,
        tbd: g.status.startTimeTBD === true,
        state: st,
        ifNecessary: g.ifNecessary === "Y",
        homeId: g.teams.home.team.placeholder ? null : g.teams.home.team.id,
        homeScore: st === "SCHEDULED" ? null : (g.teams.home.score ?? null),
        awayScore: st === "SCHEDULED" ? null : (g.teams.away.score ?? null),
        winnerId: st === "FINAL" ? winner : null,
      };
    });
    const winsTop = top.id == null ? 0 : games.filter((g) => g.winnerId === top.id).length;
    const winsBottom = bottom.id == null ? 0 : games.filter((g) => g.winnerId === bottom.id).length;
    const need = Math.ceil(BEST_OF[round] / 2);
    const winnerId = winsTop >= need ? top.id : winsBottom >= need ? bottom.id : null;
    const state: PsSeries["state"] = winnerId != null ? "FINAL" : games.some((g) => g.state !== "SCHEDULED") ? "LIVE" : "SCHEDULED";
    const lgFromDesc = /^(AL|NL)\b/.exec(first.seriesDescription ?? "")?.[1] as League | undefined;
    const lgId = topRef.league?.id ?? bottomRef.league?.id;
    const league: League | null = round === "ws" ? null : (lgFromDesc ?? (lgId != null ? (LEAGUE_OF[lgId] ?? null) : null));
    series.push({
      id: s.series.id,
      round,
      league,
      bestOf: BEST_OF[round],
      top,
      bottom,
      winsTop,
      winsBottom,
      state,
      winnerId,
      games,
      probTop: null,
    });
  }

  projectPlaceholders(series, seeds, opts);

  // 시리즈 승리 확률 — 두 팀이 정해진(예상 포함) 결판 전 시리즈만. 진행 중이면 현재 승수에서 이어서 계산.
  for (const s of series) {
    if (s.winnerId != null || s.top.id == null || s.bottom.id == null) continue;
    const et = opts.eloOf(s.top.id);
    const eb = opts.eloOf(s.bottom.id);
    if (et == null || eb == null) continue;
    s.probTop = seriesWinProb(
      s.round,
      expected(et + MLB_SERIES_HOME_ELO, eb),
      expected(et, eb + MLB_SERIES_HOME_ELO),
      s.winsTop,
      s.winsBottom,
    );
  }

  const ws = series.find((s) => s.round === "ws");
  const champion = ws?.winnerId != null ? (ws.top.id === ws.winnerId ? ws.top : ws.bottom) : null;
  // 확정 = 실제 팀이 들어온 자리만. 현재 순위로 채운 "예상" 팀은 확정이 아니다.
  const fixed = (t: PsTeam) => !t.placeholder && !t.projected;
  const fieldSet =
    series.some((s) => s.round === "wc") &&
    series.filter((s) => s.round === "wc").every((s) => fixed(s.top) && fixed(s.bottom)) &&
    series.filter((s) => s.round === "ds").every((s) => fixed(s.top));
  return { season, seeds, chase, series, fieldSet, champion };
}

/**
 * 자리표시자 자리의 시드를 구조로 알아내 현재 순위 시드 팀으로 채운다("예상").
 * WC: 3v6·4v5 — 한쪽 시드를 알면 반대쪽은 9−시드, "와일드카드 N위"는 N+3번, 지구 후보("A/B")는 3·6번.
 * DS: 상위 시드는 1·2번 — 같은 리그 다른 DS 의 상위 시드가 s 면 3−s. 하위(WC 승자)는 결과 전이라 채우지 않는다.
 * 후보 팀이 적힌 자리("휴스턴/텍사스")는 채울 팀이 그 후보 안에 있을 때만 채운다(구조 추정이 틀렸으면 원래대로).
 */
function projectPlaceholders(series: PsSeries[], seeds: Record<League, SeedRow[]>, opts: BuildOptions) {
  const wcNo = (t: PsTeam) => {
    const m = /와일드카드 (\d)위$/.exec(t.name);
    return m ? Number(m[1]) + 3 : null;
  };
  const isCandidates = (t: PsTeam) => t.placeholder && /^[A-Z]{2,3}(\/[A-Z]{2,3})+$/.test(t.abbr);
  const fill = (t: PsTeam, lg: League | null, seed: number | null): PsTeam => {
    if (!t.placeholder || !lg || seed == null) return t;
    const row = seeds[lg].find((r) => r.seed === seed);
    if (!row) return t;
    if (isCandidates(t) && !t.abbr.split("/").includes(row.abbr)) return t;
    return {
      id: row.id,
      name: row.name,
      abbr: row.abbr,
      seed,
      placeholder: false,
      projected: true,
      slotNote: t.name,
      korea: opts.koreaOf(row.id),
    };
  };
  for (const s of series) {
    if (s.round === "wc") {
      let topSeed = s.top.seed ?? wcNo(s.top) ?? (isCandidates(s.top) ? 3 : null);
      let botSeed = s.bottom.seed ?? wcNo(s.bottom) ?? null;
      if (topSeed == null && botSeed != null) topSeed = 9 - botSeed;
      if (botSeed == null && topSeed != null) botSeed = 9 - topSeed;
      s.top = fill(s.top, s.league, topSeed);
      s.bottom = fill(s.bottom, s.league, botSeed);
    } else if (s.round === "ds" && s.top.placeholder) {
      const other = series.find((o) => o !== s && o.round === "ds" && o.league === s.league && o.top.seed != null);
      if (other?.top.seed === 1 || other?.top.seed === 2) s.top = fill(s.top, s.league, 3 - other.top.seed);
    }
  }
}
