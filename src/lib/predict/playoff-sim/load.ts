// 플레이오프 확률 로더 — 리그별로 현재 전적·남은 정규시즌 일정·Elo·조 소속을 모아 engine 을 돌린다. 1시간 공용 캐시.
// 조 소속: NHL=공식 standings, KHL=ts 표 컨퍼런스, NPB=ts 표 센트럴·퍼시픽, NBA·MLS=팀명 고정표, KBO·KBL=단일 표.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { calcEloTable, getElo } from "@/lib/predict/elo";
import { selectSeasonMatches } from "@/lib/predict/season-matches";
import { withoutPreseason } from "@/lib/predict/preseason";
import { stripBaseballAllStarMatches } from "@/lib/sports/baseball/allstar";
import { fetchNhlStandings } from "@/lib/sports/nhl-api";
import { NHL_ABBR_TO_FULL } from "@/lib/sports/nhl-salaries";
import { fetchHockeyTable } from "@/lib/sports/thesports/hockey-table";
import { fetchBaseballTable, npbDivisionKo } from "@/lib/sports/thesports/baseball-table";
import type { PredictMatch } from "@/lib/predict/types";
import { runPlayoffSim, FORMAT_SPORT, type PlayoffFormat, type PlayoffOdds, type SimTeam } from "./engine";

export const PLAYOFF_FORMATS: ReadonlySet<string> = new Set<PlayoffFormat>(["KBO", "NPB", "NHL", "NBA", "KHL", "MLS", "KBL"]);

export interface PlayoffOddsResult {
  league: PlayoffFormat;
  odds: PlayoffOdds[];
  /** 그룹 표시 이름 (group 키 → 한글) */
  groupLabel: Record<string, string>;
  /** 팀별 현재 전적 문자열 */
  record: Record<number, string>;
  finished: number;
  remaining: number;
  /** 완료 경기가 적어 Elo(지난 시즌까지) 비중이 큰 상태 */
  early: boolean;
  computedAt: string;
}

const NBA_EAST = new Set([
  "Atlanta Hawks", "Boston Celtics", "Brooklyn Nets", "Charlotte Hornets", "Chicago Bulls", "Cleveland Cavaliers",
  "Detroit Pistons", "Indiana Pacers", "Miami Heat", "Milwaukee Bucks", "New York Knicks", "Orlando Magic",
  "Philadelphia 76ers", "Toronto Raptors", "Washington Wizards",
]);
const NBA_WEST = new Set([
  "Dallas Mavericks", "Denver Nuggets", "Golden State Warriors", "Houston Rockets", "LA Clippers", "Los Angeles Lakers",
  "Memphis Grizzlies", "Minnesota Timberwolves", "New Orleans Pelicans", "Oklahoma City Thunder", "Phoenix Suns",
  "Portland Trail Blazers", "Sacramento Kings", "San Antonio Spurs", "Utah Jazz",
]);
const MLS_EAST = new Set([
  "Atlanta United FC", "Charlotte FC", "Chicago Fire FC", "FC Cincinnati", "Columbus Crew", "D.C. United", "Inter Miami CF",
  "CF Montréal", "Nashville SC", "New England Revolution", "New York City FC", "Red Bull New York", "Orlando City SC",
  "Philadelphia Union", "Toronto FC",
]);

/**
 * 종목별 전력 폭(Elo 표준편차 목표)·홈 어드밴티지 — 경기 예측용 공용 Elo 는 분포가 넓고 홈 가산이 커서(야구·하키 100)
 * 시즌 전체를 굴리면 1위 팀 우승 60%(NHL) 같은 과신이 나온다(2026-09-30 실측: 1위 vs 평균 홈 승률 NHL 0.86·NBA 0.94·NPB 0.83).
 * 순서는 그대로 두고 폭만 종목 실측 승률 범위에 맞춘다: 최상위 팀 vs 평균 팀 홈 승률 약 야구 0.62·하키 0.65·농구 0.75.
 * z 는 ±2 로 자른다 — 팀 수가 적은 리그(KBL 10팀)에서 한 팀이 튀면 우승 91% 가 나왔다.
 */
const CALIB: Record<string, { sd: number; home: number; draw: number }> = {
  baseball: { sd: 40, home: 24, draw: 0 },
  hockey: { sd: 40, home: 35, draw: 0 },
  basketball: { sd: 70, home: 55, draw: 0 },
  soccer: { sd: 55, home: 60, draw: 0.25 },
};

const EXPECTED_TEAMS: Record<PlayoffFormat, number> = { KBO: 10, NPB: 12, NHL: 32, NBA: 30, KHL: 20, MLS: 30, KBL: 10 };

export async function computePlayoffOdds(league: PlayoffFormat): Promise<PlayoffOddsResult | null> {
  const sport = FORMAT_SPORT[league];
  const all = await prisma.match.findMany({
    where: { league },
    select: { id: true, league: true, status: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, startTime: true },
  });
  const clean = stripBaseballAllStarMatches(await withoutPreseason(all, league)) as PredictMatch[];
  const sel = selectSeasonMatches(clean, league);
  if (sel.isPreviousSeason) return null;
  const season = sel.season;
  const elo = calcEloTable(clean.filter((m) => m.status === "FINISHED"));

  // 팀·조 결정
  const teamsDb = await prisma.team.findMany({ where: { league }, select: { id: true, name: true } });
  const groupOf = new Map<number, { group: string; division?: string }>();
  const groupLabel: Record<string, string> = { ALL: "" };
  const official = new Map<number, { w: number; l: number; otl: number; pts: number }>();

  if (league === "NBA" || league === "MLS") {
    for (const t of teamsDb) {
      const east = league === "NBA" ? NBA_EAST.has(t.name) : MLS_EAST.has(t.name);
      const west = league === "NBA" ? NBA_WEST.has(t.name) : !east;
      if (east) groupOf.set(t.id, { group: "E" });
      else if (west) groupOf.set(t.id, { group: "W" });
    }
    groupLabel.E = "동부 컨퍼런스";
    groupLabel.W = "서부 컨퍼런스";
    if (league === "MLS") {
      // MLS 팀 행은 30개 고정이 아니다(과거 팀·친선 상대) — 이번 시즌 경기에 나온 팀만
      const inSeason = new Set(season.flatMap((m) => [m.homeTeamId, m.awayTeamId]));
      for (const id of [...groupOf.keys()]) if (!inSeason.has(id)) groupOf.delete(id);
    }
  } else if (league === "NHL") {
    const std = await fetchNhlStandings();
    const byName = new Map(teamsDb.map((t) => [t.name, t.id]));
    for (const r of std?.rows ?? []) {
      const id = byName.get(NHL_ABBR_TO_FULL[r.abbrev] ?? "");
      if (!id || !r.conference) continue;
      groupOf.set(id, { group: r.conference, division: r.division });
      official.set(id, { w: r.wins, l: r.losses, otl: r.otLosses, pts: r.points });
    }
    groupLabel.Eastern = "동부 컨퍼런스";
    groupLabel.Western = "서부 컨퍼런스";
  } else if (league === "KHL") {
    const table = await fetchHockeyTable("KHL");
    for (const g of table?.groups.filter((x) => x.kind === "conference") ?? []) {
      groupLabel[g.name] = g.label;
      for (const r of g.rows) groupOf.set(r.ourTeamId, { group: g.name });
    }
    for (const r of table?.overall ?? []) {
      official.set(r.ourTeamId, { w: r.wins + r.otWins, l: r.losses, otl: r.otLosses, pts: r.points });
    }
  } else if (league === "NPB") {
    for (const r of await fetchBaseballTable("NPB")) {
      groupOf.set(r.ourTeamId, { group: r.division });
      groupLabel[r.division] = `${npbDivisionKo(r.division)} 리그`;
      official.set(r.ourTeamId, { w: r.wins, l: r.losses, otl: r.draws, pts: 0 });
    }
  } else if (league === "KBO") {
    // KBO 현재 전적은 공식 표 — DB 경기로 세면 중복·재편성 경기가 섞여 KT 84승 12무(공식 82승 4무)가 됐다
    for (const r of await fetchBaseballTable("KBO")) {
      groupOf.set(r.ourTeamId, { group: "ALL" });
      official.set(r.ourTeamId, { w: r.wins, l: r.losses, otl: r.draws, pts: 0 });
    }
    if (groupOf.size < EXPECTED_TEAMS.KBO) {
      groupOf.clear();
      official.clear();
      for (const m of season) for (const id of [m.homeTeamId, m.awayTeamId]) groupOf.set(id, { group: "ALL" });
    }
  } else {
    // KBO·KBL — 이번 시즌 경기에 나온 팀 전부 한 표
    for (const m of season) for (const id of [m.homeTeamId, m.awayTeamId]) groupOf.set(id, { group: "ALL" });
  }
  if (groupOf.size < EXPECTED_TEAMS[league]) return null;
  // Elo 근거가 너무 적으면(팀당 종료 경기 8 미만 — KBL 은 DB 에 지난 시즌 기록이 6경기뿐이라 한 팀 우승 74% 가 나왔다) 내지 않는다
  const eloGames = clean.filter((m) => m.status === "FINISHED" && groupOf.has(m.homeTeamId) && groupOf.has(m.awayTeamId)).length;
  if ((eloGames * 2) / groupOf.size < 8) return null;

  // 현재 전적 — 공식 표(하키) 우선, 없으면 이번 시즌 종료 경기
  const rec = new Map<number, { w: number; l: number; d: number }>();
  for (const id of groupOf.keys()) rec.set(id, { w: 0, l: 0, d: 0 });
  let finished = 0;
  for (const m of season) {
    if (m.status !== "FINISHED" || m.homeScore == null || m.awayScore == null) continue;
    const h = rec.get(m.homeTeamId);
    const a = rec.get(m.awayTeamId);
    if (!h || !a) continue;
    finished++;
    if (m.homeScore > m.awayScore) { h.w++; a.l++; }
    else if (m.homeScore < m.awayScore) { a.w++; h.l++; }
    else { h.d++; a.d++; }
  }
  const remainingGames = season
    .filter((m) => m.status === "SCHEDULED" && groupOf.has(m.homeTeamId) && groupOf.has(m.awayTeamId))
    .map((m) => ({ home: m.homeTeamId, away: m.awayTeamId }));
  // 정규시즌이 끝났으면 실제 포스트시즌 대진을 모르는 채로 처음부터 굴리게 된다 — 이 로더는 정규시즌 중에만
  if (remainingGames.length === 0) return null;

  const teams: SimTeam[] = [...groupOf.entries()].map(([id, g]) => {
    const o = official.get(id);
    const r = rec.get(id)!;
    // 야구 공식 표는 otl 자리에 무승부를 담아 온다(위) — 야구는 연장패 개념이 없다
    if (o && sport === "baseball") return { id, group: g.group, division: g.division, w: o.w, l: o.l, d: o.otl, otl: 0 };
    return o
      ? { id, group: g.group, division: g.division, w: o.w, l: o.l, d: 0, otl: o.otl, pts: o.pts }
      : { id, group: g.group, division: g.division, w: r.w, l: r.l, d: r.d, otl: 0 };
  });
  const raw = new Map(teams.map((t) => [t.id, getElo(elo, t.id)]));
  const vals = [...raw.values()];
  const mean = vals.reduce((x, y) => x + y, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((x, y) => x + (y - mean) ** 2, 0) / vals.length) || 1;
  const c = CALIB[sport];
  const eff = new Map([...raw].map(([id, e]) => [id, 1500 + Math.max(-2, Math.min(2, (e - mean) / sd)) * c.sd]));
  const prob = (h: number, a: number) => {
    const p = 1 / (1 + Math.pow(10, (eff.get(a)! - eff.get(h)! - c.home) / 400));
    // 축구 무승부 — 전력이 비슷할수록 조금 더 많이(최대 +5%p)
    const d = c.draw > 0 ? c.draw + (1 - Math.abs(p - 0.5) * 2) * 0.05 : 0;
    return { home: p * (1 - d), draw: d, away: (1 - p) * (1 - d) };
  };
  const odds = runPlayoffSim(league, teams, remainingGames, prob);

  const record: Record<number, string> = {};
  for (const t of teams) {
    record[t.id] =
      sport === "hockey" ? `${t.w}승 ${t.l}패 ${t.otl}연장패 · ${t.pts ?? 2 * t.w + t.otl}점`
      : sport === "soccer" ? `${t.w}승 ${t.d}무 ${t.l}패 · ${3 * t.w + t.d}점`
      : t.d > 0 ? `${t.w}승 ${t.d}무 ${t.l}패` : `${t.w}승 ${t.l}패`;
  }
  const perTeam = teams.length > 0 ? (finished * 2) / teams.length : 0;
  return {
    league, odds, groupLabel, record, finished, remaining: remainingGames.length,
    early: perTeam < 10,
    computedAt: new Date().toISOString(),
  };
}

export const getPlayoffOdds = unstable_cache(
  async (league: string) => (PLAYOFF_FORMATS.has(league) ? computePlayoffOdds(league as PlayoffFormat).catch((e) => {
    console.warn(`[playoff-odds] ${league}`, (e as Error).message);
    return null;
  }) : null),
  ["playoff-odds-v2"],
  { revalidate: 3600, tags: ["playoff-odds"] },
);
