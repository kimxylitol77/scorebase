// 축구 빅5 주간 리뷰 데이터 빌더 — 지난 7일 결과·팀 주간 승점·MVP 감독(시장 기대 대비 초과성과)·이변.
// MVP 선수는 weekly-best-xi 의 mvp 를 재사용해 두 글(베스트 XI 글 ↔ 리뷰 글)의 수치가 어긋나지 않게 한다.
// 여기 없는 수치는 글에 쓰지 않는다(결정론 주입 + 서사만 생성 — 야구 주간 리뷰와 같은 원칙).

import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { getWeeklyBestXi, type WeeklyBestXi } from "@/lib/soccer/weekly-best-xi";
import rawCoaches from "../../../data/team-coaches.json";

interface CoachEntry {
  name?: string;
  nameKo?: string;
}
const COACHES = rawCoaches as Record<string, CoachEntry>;

export interface WeeklyMatchRow {
  homeKo: string;
  awayKo: string;
  homeScore: number;
  awayScore: number;
  /** 시장이 본 승자 쪽 확률이 낮았던 승리 = 이변. null 이면 시장 확률 없음 */
  upsetProb: number | null;
  upsetWinnerKo: string | null;
}

export interface WeeklyTeamRow {
  teamKo: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  /** 시장 기대 승점(3·1·0 가중 합). 시장 확률 없는 경기는 제외 */
  expectedPoints: number | null;
  /** points - expectedPoints — 감독 MVP 산식의 핵심 */
  overPerf: number | null;
  coachKo: string | null;
}

export interface SoccerWeeklyReviewData {
  league: string;
  from: string; // KST YYYY-MM-DD
  to: string;
  matchCount: number;
  matches: WeeklyMatchRow[];
  teams: WeeklyTeamRow[]; // 주간 승점 내림차순
  /** 주간 MVP 감독 — 승점 최상위 중 초과성과 최대. 팀 1경기뿐인 주는 null */
  mvpCoach: { coachKo: string; teamKo: string; row: WeeklyTeamRow } | null;
  /** 이변 — 시장 확률 35% 미만 승리, 낮은 순 */
  upsets: WeeklyMatchRow[];
  /** 주간 베스트 XI 글의 MVP — 같은 창·같은 산식 재사용 */
  mvpPlayer: WeeklyBestXi["mvp"];
  xiBrief: { name: string; teamKo: string; rating: number; goals: number; assists: number }[];
}

const kstDay = (d: Date) => new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);

/** endKst(YYYY-MM-DD, 포함) 기준 지난 7일 — weekly-best-xi 와 동일 창. */
export async function buildSoccerWeeklyReview(
  league: string,
  endKst?: string,
): Promise<SoccerWeeklyReviewData | null> {
  const to = endKst ?? kstDay(new Date());
  const lt = new Date(new Date(`${to}T00:00:00+09:00`).getTime() + 86400000);
  const gte = new Date(lt.getTime() - 7 * 86400000);

  const matches = await prisma.match.findMany({
    where: { league, status: "FINISHED", startTime: { gte, lt } },
    select: {
      homeScore: true,
      awayScore: true,
      marketHome: true,
      marketDraw: true,
      marketAway: true,
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
    },
  });
  const played = matches.filter((m) => m.homeScore != null && m.awayScore != null);
  if (played.length === 0) return null;

  // 팀 → ts id → 감독. TeamSourceId(thesports) 로 해석 — Team.league 라벨은 승격·강등에 늦는다.
  const teamIds = [...new Set(played.flatMap((m) => [m.homeTeam.id, m.awayTeam.id]))];
  const tsIds = await prisma.teamSourceId.findMany({
    where: { source: "thesports", teamId: { in: teamIds } },
    select: { teamId: true, externalId: true },
  });
  const coachByTeamId = new Map<number, string>();
  for (const r of tsIds) {
    const c = COACHES[r.externalId];
    if (c?.nameKo || c?.name) coachByTeamId.set(r.teamId, c.nameKo || c.name!);
  }

  const ko = (name: string) => toKoreanTeamName(name) || name;
  const teamAgg = new Map<number, WeeklyTeamRow & { expCnt: number }>();
  const touch = (id: number, name: string) => {
    let t = teamAgg.get(id);
    if (!t) {
      t = {
        teamKo: ko(name), played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0,
        points: 0, expectedPoints: 0, overPerf: null, coachKo: coachByTeamId.get(id) ?? null, expCnt: 0,
      };
      teamAgg.set(id, t);
    }
    return t;
  };

  const rows: WeeklyMatchRow[] = [];
  for (const m of played) {
    const hs = m.homeScore!;
    const as = m.awayScore!;
    const h = touch(m.homeTeam.id, m.homeTeam.name);
    const a = touch(m.awayTeam.id, m.awayTeam.name);
    h.played++; a.played++;
    h.goalsFor += hs; h.goalsAgainst += as;
    a.goalsFor += as; a.goalsAgainst += hs;
    if (hs > as) { h.won++; h.points += 3; a.lost++; }
    else if (hs < as) { a.won++; a.points += 3; h.lost++; }
    else { h.drawn++; a.drawn++; h.points++; a.points++; }

    // 시장 기대 승점 — implied 확률(vig 제거된 marketHome/Draw/Away)로 3·1·0 가중
    let upsetProb: number | null = null;
    let upsetWinnerKo: string | null = null;
    if (m.marketHome != null && m.marketDraw != null && m.marketAway != null) {
      h.expectedPoints! += 3 * m.marketHome + m.marketDraw;
      a.expectedPoints! += 3 * m.marketAway + m.marketDraw;
      h.expCnt++; a.expCnt++;
      if (hs > as && m.marketHome < 0.35) { upsetProb = m.marketHome; upsetWinnerKo = ko(m.homeTeam.name); }
      if (hs < as && m.marketAway < 0.35) { upsetProb = m.marketAway; upsetWinnerKo = ko(m.awayTeam.name); }
    }
    rows.push({ homeKo: ko(m.homeTeam.name), awayKo: ko(m.awayTeam.name), homeScore: hs, awayScore: as, upsetProb, upsetWinnerKo });
  }

  const teams = [...teamAgg.values()]
    .map((t) => {
      // 기대 승점이 하나도 없으면(배당 미수집 주) 초과성과 판정 불가
      if (t.expCnt === 0) { t.expectedPoints = null; t.overPerf = null; }
      else {
        t.expectedPoints = Math.round(t.expectedPoints! * 100) / 100;
        t.overPerf = Math.round((t.points - t.expectedPoints) * 100) / 100;
      }
      const { expCnt: _drop, ...rest } = t;
      void _drop;
      return rest as WeeklyTeamRow;
    })
    .sort((x, y) => y.points - x.points || (y.overPerf ?? -99) - (x.overPerf ?? -99));

  // MVP 감독 — 주간 승점 최상위 그룹에서 초과성과 최대. 감독명이 없으면 다음 후보로.
  // 1경기 주(컵 위주 주)는 표본이 얕아 뽑지 않는다.
  const topPts = teams[0]?.points ?? 0;
  const mvpRow = teams
    .filter((t) => t.points === topPts && t.played >= 1 && t.coachKo)
    .sort((x, y) => (y.overPerf ?? -99) - (x.overPerf ?? -99))[0] ?? null;
  const mvpCoach = mvpRow && topPts >= 3
    ? { coachKo: mvpRow.coachKo!, teamKo: mvpRow.teamKo, row: mvpRow }
    : null;

  const upsets = rows.filter((r) => r.upsetProb != null).sort((x, y) => x.upsetProb! - y.upsetProb!);

  // MVP 선수 — weekly-best-xi 재사용 (같은 창). 실패해도 리뷰는 발행한다.
  const xi = await getWeeklyBestXi(league, to).catch(() => null);
  // XI 배열은 포지션 순(GK 부터)이라 그대로 자르면 "활약 상위"가 아니다 — 평점 순 정렬 후 상위 5
  const xiBrief = [...(xi?.xi ?? [])].sort((a, b) => b.rating - a.rating).slice(0, 5).map((p) => ({
    name: p.name, teamKo: p.countryKo || ko(p.country), rating: p.rating, goals: p.goals, assists: p.assists,
  }));

  return {
    league,
    from: kstDay(gte),
    to,
    matchCount: played.length,
    matches: rows,
    teams,
    mvpCoach,
    upsets,
    mvpPlayer: xi?.mvp ?? null,
    xiBrief,
  };
}
