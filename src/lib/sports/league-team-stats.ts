// 리그 팀 통계(순위표 아래) — 경기 결과로 모든 리그에 같은 기본 열(승패·득실·홈/원정·최근 5경기)을 만들고,
// 공식 세부 기록이 있는 리그(KBL)는 야투율·리바운드 등을 덧붙인다. 개막 직후(팀 80% 미만이 3경기 이상)엔 지난 시즌.
// 정규시즌만 — NHL·NBA·MLB 포스트시즌·플레이인·올스타는 playoffRound 가 비어 있어 ESPN raw 로 뺀다. 올스타(KBO 드림·나눔 등) 같은 3경기 미만 팀은 표에서 뺀다.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { SEASON_BOUNDARY, currentSeasonStart, previousSeasonStart } from "@/lib/predict/season-window";
import { MIN_SEASON_GAMES } from "@/lib/predict/season-scope";
import { withoutPreseason } from "@/lib/predict/preseason";
import { BASEBALL_LEAGUES, BASKETBALL_LEAGUES, HOCKEY_LEAGUES, SOCCER_LEAGUES, leagueHasDraw } from "@/lib/sports/sport-leagues";
import { fetchKblSeasonList, fetchKblTeamRank } from "@/lib/sports/kbl-api";
import { KBL_TEAM_CODE } from "@/lib/sports/kbl-game";

export interface TeamStatRow {
  teamId: number; name: string; logoUrl: string | null;
  g: number; w: number; d: number; l: number; pf: number; pa: number;
  home: [number, number, number]; away: [number, number, number];
  form: Array<"W" | "D" | "L">;
  /** 공식 세부 기록(경기당) — 열 순서는 extraCols 와 같다 */
  extra?: Array<string | null>;
}
export interface LeagueTeamStats { label: string; last: boolean; hasDraw: boolean; rows: TeamStatRow[]; extraCols: string[]; extraSource: string | null }

const label = (start: Date, league: string) => {
  const y = start.getUTCFullYear();
  return SEASON_BOUNDARY[league].month >= 7 ? `${y}-${String((y + 1) % 100).padStart(2, "0")}` : String(y);
};

/** 종목: 축구·야구·농구·하키만(배구는 점수가 세트, e스포츠는 세트 수라 득실 의미가 다르다). 시즌 경계가 있는 리그만. */
export function supportsTeamStats(league: string): boolean {
  if (!SEASON_BOUNDARY[league]) return false;
  return SOCCER_LEAGUES.has(league) || BASEBALL_LEAGUES.has(league) || BASKETBALL_LEAGUES.has(league) || HOCKEY_LEAGUES.has(league);
}

async function compute(league: string): Promise<LeagueTeamStats | null> {
  if (!supportsTeamStats(league)) return null;
  const now = new Date();
  const curStart = currentSeasonStart(league, now)!;
  const prevStart = previousSeasonStart(curStart);
  // 포스트시즌 컷오프 — ESPN 이 표시한 첫 포스트시즌·플레이인 경기 이후는 전부 뺀다(ts 쪽 라벨 없는 같은 경기 행까지, MLB 와일드카드 2026-09-29).
  const POST = ['"slug":"post-season"', '"slug":"play-in-season"'];
  const post = await prisma.match.findMany({
    where: { league, startTime: { gte: prevStart, lte: now }, OR: POST.map((t) => ({ raw: { contains: t } })) },
    select: { startTime: true },
  });
  const firstPost = (from: Date, to: Date) => post.map((p) => p.startTime).filter((t) => t >= from && t < to).sort((a, b) => +a - +b)[0];
  const cutPrev = firstPost(prevStart, curStart), cutCur = firstPost(curStart, new Date(8.64e15));
  const afterPost = (d: Date) => (d < curStart ? !!cutPrev && d >= cutPrev : !!cutCur && d >= cutCur);
  const raw = await prisma.match.findMany({
    where: {
      league, startTime: { gte: prevStart, lte: now }, playoffRound: null,
      OR: [{ raw: null }, { NOT: { raw: { contains: '"abbreviation":"ALLSTAR"' } } }],
    },
    select: { id: true, league: true, status: true, startTime: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
    orderBy: { startTime: "asc" },
  });
  // 프리시즌(NHL·NBA·WNBA) 제외, 야구 시범경기는 점수 없는 0-0 종료로 들어와 뺀다.
  // KBL·WKBL 정규리그는 10~4월 — 6~9월 경기는 비시즌 컵(WKBL 7/31 박신자컵 등)이라 뺀다.
  const offMonth = (d: Date) => (league === "KBL" || league === "WKBL") && d.getUTCMonth() >= 5 && d.getUTCMonth() <= 8;
  const all = (await withoutPreseason(raw, league)).filter(
    (m) => m.status === "FINISHED" && m.homeScore != null && m.awayScore != null && !offMonth(m.startTime) && !afterPost(m.startTime) && !(BASEBALL_LEAGUES.has(league) && m.homeScore === 0 && m.awayScore === 0),
  );
  const cur = all.filter((m) => m.startTime >= curStart);
  const curTeams = new Set(raw.filter((m) => m.startTime >= curStart && !afterPost(m.startTime)).flatMap((m) => [m.homeTeamId, m.awayTeamId]));
  const played = (id: number) => cur.filter((m) => m.homeTeamId === id || m.awayTeamId === id).length;
  const useCurrent = curTeams.size > 0 && [...curTeams].filter((id) => played(id) >= MIN_SEASON_GAMES).length >= curTeams.size * 0.8;
  const games = useCurrent ? cur : all.filter((m) => m.startTime < curStart);
  if (games.length === 0) return null;

  const acc = new Map<number, TeamStatRow>();
  const get = (id: number) => {
    let r = acc.get(id);
    if (!r) { r = { teamId: id, name: "", logoUrl: null, g: 0, w: 0, d: 0, l: 0, pf: 0, pa: 0, home: [0, 0, 0], away: [0, 0, 0], form: [] }; acc.set(id, r); }
    return r;
  };
  for (const m of games) {
    for (const side of ["home", "away"] as const) {
      const r = get(side === "home" ? m.homeTeamId : m.awayTeamId);
      const f = side === "home" ? m.homeScore! : m.awayScore!, a = side === "home" ? m.awayScore! : m.homeScore!;
      const res = f > a ? "W" : f < a ? "L" : "D";
      r.g++; r.pf += f; r.pa += a;
      if (res === "W") r.w++; else if (res === "L") r.l++; else r.d++;
      const v = side === "home" ? r.home : r.away;
      v[res === "W" ? 0 : res === "D" ? 1 : 2]++;
      r.form.push(res);
    }
  }
  const teams = await prisma.team.findMany({ where: { id: { in: [...acc.keys()] } }, select: { id: true, name: true, logoUrl: true } });
  for (const t of teams) { const r = acc.get(t.id)!; r.name = toKoreanTeamName(t.name, league) || t.name; r.logoUrl = t.logoUrl; }
  const hasDraw = leagueHasDraw(league);
  const rows = [...acc.values()]
    .filter((r) => r.name && r.g >= MIN_SEASON_GAMES)
    .map((r) => ({ ...r, form: r.form.slice(-5) }))
    .sort((x, y) =>
      hasDraw
        ? (y.w * 3 + y.d) - (x.w * 3 + x.d) || (y.pf - y.pa) - (x.pf - x.pa) || y.pf - x.pf
        : y.w / y.g - x.w / x.g || (y.pf - y.pa) / y.g - (x.pf - x.pa) / x.g,
    );
  const seasonStart = useCurrent ? curStart : prevStart;
  const out: LeagueTeamStats = { label: label(seasonStart, league), last: !useCurrent, hasDraw, rows, extraCols: [], extraSource: null };

  // KBL — 공식 팀 시즌 기록(/league/rank). 같은 시즌 라벨의 표가 있을 때만.
  if (league === "KBL") {
    const season = (await fetchKblSeasonList()).find((s) => s.label === out.label);
    const off = season ? await fetchKblTeamRank(season.glkey) : [];
    if (off.length) {
      const byId = new Map(off.map((o) => [Number(Object.entries(KBL_TEAM_CODE).find(([, c]) => c === o.teamCode)?.[0]), o]));
      const pct = (m: number, a: number) => (a > 0 ? ((m / a) * 100).toFixed(1) : null);
      const per = (v: number, g: number) => (g > 0 ? (v / g).toFixed(1) : null);
      out.extraCols = ["야투%", "3점", "3점%", "자유투%", "리바", "어시", "스틸", "블록", "턴오버"];
      out.extraSource = "KBL 공식";
      for (const r of out.rows) {
        const o = byId.get(r.teamId);
        r.extra = o
          ? [pct(o.fg + o.threep, o.fgA + o.threepA), per(o.threep, o.gameCount), pct(o.threep, o.threepA), pct(o.ft, o.ftA), per(o.OR + o.DR, o.gameCount), per(o.AS, o.gameCount), per(o.ST, o.gameCount), per(o.BS, o.gameCount), per(o.TO, o.gameCount)]
          : out.extraCols.map(() => null);
      }
    }
  }
  return out;
}

export const getLeagueTeamStats = unstable_cache(compute, ["league-team-stats-v2"], { revalidate: 600 });
