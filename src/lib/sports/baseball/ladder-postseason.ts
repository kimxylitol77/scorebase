// KBO·NPB 포스트시즌 대진표 모델 — 순위표(시드) + 가을 경기 목록을 "계단식" 시리즈로 조립. 네트워크·DB 없는 순수 함수.
//   KBO(5팀): 와일드카드(4위 1승 안고 시작, 최대 2경기, 4위 홈) → 준PO(3위, 5전 3선승) → PO(2위, 5전 3선승) → 한국시리즈(1위, 7전 4선승)
//   NPB(리그별 3팀): CS 퍼스트(2위 vs 3위, 3전 2선승, 2위 홈·못 가리면 2위 진출) → 파이널(1위 1승 안고 시작, 4승 선승, 최대 6경기, 1위 홈)
//                   → 일본시리즈(7전 4선승, 1차전 개최 = 짝수 해 센트럴·홀수 해 퍼시픽 — 2021~2025 실측)
//   경기는 두 팀 짝으로 시리즈에 붙인다(한 시즌 안에서 사다리의 짝은 겹치지 않는다).

export type LadderLeague = "KBO" | "NPB";

export interface StandRow {
  teamId: number;
  name: string;
  /** NPB 센트럴·퍼시픽. KBO 는 "" */
  group: string;
  position: number;
  wins: number;
  draws: number;
  losses: number;
  played: number;
}
export interface PsGameIn {
  id: string;
  /** ISO (시각 미정이면 현지 18시 등 추정값) */
  date: string;
  homeId: number;
  awayId: number;
  homeScore: number | null;
  awayScore: number | null;
  state: "SCHEDULED" | "LIVE" | "FINAL";
  href: string | null;
}

export interface LTeam {
  id: number | null;
  name: string;
  seed: number | null;
  placeholder: boolean;
  /** 정규시즌이 안 끝나 현재 순위로 넣은 시드 — 화면에 노란 시드 */
  projected: boolean;
}
export interface LSeries {
  key: string;
  label: string;
  short: string;
  group: string | null;
  top: LTeam;
  bottom: LTeam;
  /** 상위 시드가 안고 시작하는 승수 */
  advantage: number;
  need: number;
  maxGames: number;
  /** 최대 경기를 다 해도 못 가리면 상위 시드 진출(KBO 와일드카드·NPB CS) */
  capTop: boolean;
  formatLabel: string;
  games: PsGameIn[];
  winsTop: number;
  winsBottom: number;
  state: "SCHEDULED" | "LIVE" | "FINAL";
  winnerId: number | null;
  /** 상위 시드 시리즈 승리 확률(자체 Elo) — 두 팀이 정해졌고 결판 전일 때 */
  probTop: number | null;
}
export interface SeedRow {
  seed: number;
  teamId: number;
  name: string;
  group: string;
  wins: number;
  draws: number;
  losses: number;
  played: number;
  pct: number;
  /** 확정 여부 — 수학적으로 진출권을 지켰으면 true (동률·상대 전적은 보수적으로 미확정) */
  clinched: boolean;
}
export interface ChaseRow extends Omit<SeedRow, "seed" | "clinched"> {
  /** 마지막 진출 자리와의 경기 차 */
  gamesBack: number;
  eliminated: boolean;
}
export interface LadderModel {
  league: LadderLeague;
  season: number;
  regularDone: boolean;
  /** 그룹별 시드(KBO 는 "" 하나) */
  seeds: Record<string, SeedRow[]>;
  chase: Record<string, ChaseRow[]>;
  series: LSeries[];
  champion: LTeam | null;
  /** 최종 시리즈(한국시리즈·일본시리즈) */
  finalKey: string;
}

export const REGULAR_GAMES: Record<LadderLeague, number> = { KBO: 144, NPB: 143 };
/** 시리즈 확률의 홈 가산 Elo — MLB 대진표와 같은 값(홈 승률 53.5% 안팎) */
export const LADDER_HOME_ELO = 24;

const pctOf = (w: number, l: number) => (w + l > 0 ? w / (w + l) : 0);

interface Spec {
  key: string;
  label: string;
  short: string;
  group: string | null;
  topSeed: number | null;
  bottomSeed: number | null;
  /** 하위 자리를 채울 앞 시리즈 */
  fromKey: string | null;
  bottomNote: string;
  advantage: number;
  need: number;
  maxGames: number;
  capTop: boolean;
  /** 상위 시드 기준 홈(T)·원정(B) 순서 */
  home: string;
  formatLabel: string;
}

function kboSpecs(): Spec[] {
  return [
    { key: "wc", label: "와일드카드 결정전", short: "WC", group: null, topSeed: 4, bottomSeed: 5, fromKey: null, bottomNote: "", advantage: 1, need: 2, maxGames: 2, capTop: true, home: "TT", formatLabel: "4위 1승 안고 최대 2경기" },
    { key: "spo", label: "준플레이오프", short: "준PO", group: null, topSeed: 3, bottomSeed: null, fromKey: "wc", bottomNote: "와일드카드 승자", advantage: 0, need: 3, maxGames: 5, capTop: false, home: "TTBBT", formatLabel: "5전 3선승" },
    { key: "po", label: "플레이오프", short: "PO", group: null, topSeed: 2, bottomSeed: null, fromKey: "spo", bottomNote: "준PO 승자", advantage: 0, need: 3, maxGames: 5, capTop: false, home: "TTBBT", formatLabel: "5전 3선승" },
    { key: "ks", label: "한국시리즈", short: "KS", group: null, topSeed: 1, bottomSeed: null, fromKey: "po", bottomNote: "PO 승자", advantage: 0, need: 4, maxGames: 7, capTop: false, home: "TTBBBTT", formatLabel: "7전 4선승" },
  ];
}

export const NPB_GROUPS = ["센트럴", "퍼시픽"] as const;

function npbSpecs(): Spec[] {
  const out: Spec[] = [];
  for (const g of NPB_GROUPS) {
    const k = g === "센트럴" ? "c" : "p";
    out.push(
      { key: `fs-${k}`, label: `${g} CS 퍼스트 스테이지`, short: "퍼스트", group: g, topSeed: 2, bottomSeed: 3, fromKey: null, bottomNote: "", advantage: 0, need: 2, maxGames: 3, capTop: true, home: "TTT", formatLabel: "3전 2선승" },
      { key: `final-${k}`, label: `${g} CS 파이널 스테이지`, short: "파이널", group: g, topSeed: 1, bottomSeed: null, fromKey: `fs-${k}`, bottomNote: "2·3위 승자", advantage: 1, need: 4, maxGames: 6, capTop: true, home: "TTTTTT", formatLabel: "1위 1승 안고 4승 선승" },
    );
  }
  return out;
}

/** 시리즈 승리 확률 — 경기별 승률(상위 시드 홈/원정) × 홈 순서, 어드밴티지·최대 경기·상위 진출 규칙 반영. 무승부는 무시. */
export function seriesWinProb(pTopHome: number, pTopAway: number, home: string, need: number, advantage: number, maxGames: number, capTop: boolean, winsTop: number, winsBottom: number, played: number): number {
  const memo = new Map<string, number>();
  const f = (g: number, t: number, b: number): number => {
    if (t + advantage >= need) return 1;
    if (b >= need) return 0;
    if (g >= maxGames) return capTop ? 1 : 0.5;
    const key = `${g}|${t}|${b}`;
    const hit = memo.get(key);
    if (hit != null) return hit;
    const p = home[g] === "B" ? pTopAway : pTopHome;
    const v = p * f(g + 1, t + 1, b) + (1 - p) * f(g + 1, t, b + 1);
    memo.set(key, v);
    return v;
  };
  return f(played, winsTop, winsBottom);
}

const expected = (a: number, b: number) => 1 / (1 + 10 ** ((b - a) / 400));

export interface BuildOptions {
  eloOf: (teamId: number) => number | null;
}

/** 그룹 안 순위 → 시드·추격·확정 판정. cutoff = 진출 팀 수 */
function seedTable(rows: StandRow[], cutoff: number, total: number, done: boolean): { seeds: SeedRow[]; chase: ChaseRow[] } {
  const sorted = [...rows].sort((a, b) => a.position - b.position);
  const worst = (r: StandRow) => pctOf(r.wins, r.losses + (total - r.played));
  const best = (r: StandRow) => pctOf(r.wins + (total - r.played), r.losses);
  const inside = sorted.slice(0, cutoff);
  const outside = sorted.slice(cutoff);
  const bestOut = outside.reduce((m, r) => Math.max(m, best(r)), 0);
  const worstIn = inside.reduce((m, r) => Math.min(m, worst(r)), 1);
  const last = inside[inside.length - 1];
  const seeds = inside.map((r, i) => ({
    seed: i + 1, teamId: r.teamId, name: r.name, group: r.group, wins: r.wins, draws: r.draws, losses: r.losses, played: r.played,
    pct: pctOf(r.wins, r.losses), clinched: done || worst(r) > bestOut,
  }));
  const chase = outside.slice(0, 2).map((r) => ({
    teamId: r.teamId, name: r.name, group: r.group, wins: r.wins, draws: r.draws, losses: r.losses, played: r.played, pct: pctOf(r.wins, r.losses),
    gamesBack: last ? (last.wins - r.wins + (r.losses - last.losses)) / 2 : 0,
    eliminated: done || best(r) < worstIn,
  }));
  return { seeds, chase };
}

export function buildLadder(league: LadderLeague, season: number, table: StandRow[], games: PsGameIn[], opts: BuildOptions): LadderModel {
  const total = REGULAR_GAMES[league];
  const regularDone = table.length > 0 && table.every((r) => r.played >= total);
  const groups = league === "KBO" ? [""] : [...NPB_GROUPS];
  const cutoff = league === "KBO" ? 5 : 3;
  const seeds: Record<string, SeedRow[]> = {};
  const chase: Record<string, ChaseRow[]> = {};
  for (const g of groups) {
    const t = seedTable(table.filter((r) => r.group === g), cutoff, total, regularDone);
    seeds[g] = t.seeds;
    chase[g] = t.chase;
  }

  const seedTeam = (g: string | null, seed: number | null): LTeam | null => {
    const row = seeds[g ?? ""]?.find((r) => r.seed === seed);
    return row ? { id: row.teamId, name: row.name, seed, placeholder: false, projected: !regularDone } : null;
  };
  const ph = (name: string): LTeam => ({ id: null, name, seed: null, placeholder: true, projected: false });

  const specs = league === "KBO" ? kboSpecs() : npbSpecs();
  const series: LSeries[] = [];
  const byKey = new Map<string, LSeries>();
  const winnerTeam = (s: LSeries | undefined): LTeam | null => (s?.winnerId != null ? (s.top.id === s.winnerId ? s.top : s.bottom) : null);

  const make = (sp: Spec, top: LTeam, bottom: LTeam): LSeries => {
    const sGames = top.id != null && bottom.id != null
      ? games.filter((x) => (x.homeId === top.id && x.awayId === bottom.id) || (x.homeId === bottom.id && x.awayId === top.id)).sort((a, b) => a.date.localeCompare(b.date))
      : [];
    const fin = sGames.filter((x) => x.state === "FINAL" && x.homeScore != null && x.awayScore != null);
    const won = (id: number | null) => fin.filter((x) => (x.homeScore! > x.awayScore! ? x.homeId : x.awayScore! > x.homeScore! ? x.awayId : null) === id).length;
    const winsTop = won(top.id);
    const winsBottom = won(bottom.id);
    const winnerId = winsTop + sp.advantage >= sp.need ? top.id
      : winsBottom >= sp.need ? bottom.id
        : sp.capTop && fin.length >= sp.maxGames ? top.id : null;
    const state: LSeries["state"] = winnerId != null ? "FINAL" : sGames.some((x) => x.state !== "SCHEDULED") ? "LIVE" : "SCHEDULED";
    let probTop: number | null = null;
    if (winnerId == null && top.id != null && bottom.id != null) {
      const et = opts.eloOf(top.id), eb = opts.eloOf(bottom.id);
      if (et != null && eb != null) {
        probTop = seriesWinProb(expected(et + LADDER_HOME_ELO, eb), expected(et, eb + LADDER_HOME_ELO), sp.home, sp.need, sp.advantage, sp.maxGames, sp.capTop, winsTop, winsBottom, fin.length);
      }
    }
    return { key: sp.key, label: sp.label, short: sp.short, group: sp.group, top, bottom, advantage: sp.advantage, need: sp.need, maxGames: sp.maxGames, capTop: sp.capTop, formatLabel: sp.formatLabel, games: sGames, winsTop, winsBottom, state, winnerId, probTop };
  };

  for (const sp of specs) {
    const top = seedTeam(sp.group, sp.topSeed) ?? ph(`${sp.topSeed}위`);
    const bottom = sp.bottomSeed != null ? (seedTeam(sp.group, sp.bottomSeed) ?? ph(`${sp.bottomSeed}위`)) : (winnerTeam(byKey.get(sp.fromKey!)) ?? ph(sp.bottomNote));
    const s = make(sp, top, bottom);
    series.push(s);
    byKey.set(s.key, s);
  }

  let finalKey = "ks";
  if (league === "NPB") {
    // 일본시리즈 — 1차전 개최 리그 챔피언을 위(홈 먼저)로
    const c = winnerTeam(byKey.get("final-c")) ?? ph("센트럴 챔피언");
    const p = winnerTeam(byKey.get("final-p")) ?? ph("퍼시픽 챔피언");
    const [top, bottom] = season % 2 === 0 ? [c, p] : [p, c];
    const s = make({ key: "js", label: "일본시리즈", short: "일본S", group: null, topSeed: null, bottomSeed: null, fromKey: null, bottomNote: "", advantage: 0, need: 4, maxGames: 7, capTop: false, home: "TTBBBTT", formatLabel: "7전 4선승" }, top, bottom);
    series.push(s);
    finalKey = "js";
  }
  const champion = winnerTeam(series.find((s) => s.key === finalKey));
  return { league, season, regularDone, seeds, chase, series, champion, finalKey };
}

/**
 * 정규시즌 뒤 가을 경기만 — 진출 못 한 팀들의 마지막 종료 경기 날짜 다음 날부터.
 * 진출 팀끼리의 막판 순연 경기가 그 뒤에 잡히면 섞일 수 있으나, 시리즈 짝(사다리)으로 한 번 더 걸러진다.
 * 정규시즌이 안 끝났으면(순위표 경기 수 미달) 가을 경기 없음.
 */
export function postseasonGames(all: PsGameIn[], table: StandRow[], seededIds: Set<number>, total: number): PsGameIn[] {
  if (table.length === 0 || !table.every((r) => r.played >= total)) return [];
  let end = "";
  for (const g of all) {
    if (g.state !== "FINAL") continue;
    if ((!seededIds.has(g.homeId) || !seededIds.has(g.awayId)) && g.date > end) end = g.date;
  }
  const endDay = end.slice(0, 10);
  return all.filter((g) => g.date.slice(0, 10) > endDay).sort((a, b) => a.date.localeCompare(b.date));
}
