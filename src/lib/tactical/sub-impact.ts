// 리그별 교체(서브) 임팩트 집계 — ts 캐시 incidents(교체·골·그 시점 스코어)와 라인업으로
// 조커 랭킹·감독 교체 성향·뒤지던 경기 승점 회수·포메이션 전적을 계산해 SubImpactCache 에 저장.
// /soccer/sub-impact 페이지와 /coaches/[id] 현시즌 카드가 읽는다. 일 1회 cron 재계산.

import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import rawCoaches from "../../../data/team-coaches.json";
import rawCoachPhotos from "../../../data/coach-photos.json";

// 시즌 시작 경계 — 유럽·터키는 26-27 개막(8월), K리그·J리그는 2026 단년 시즌(2~3월 개막).
export const SUB_IMPACT_LEAGUES: Record<string, { start: string; seasonLabel: string }> = {
  EPL: { start: "2026-08-01", seasonLabel: "2026-27" },
  CHAMPIONSHIP: { start: "2026-08-01", seasonLabel: "2026-27" },
  LALIGA: { start: "2026-08-01", seasonLabel: "2026-27" },
  BUNDESLIGA: { start: "2026-08-01", seasonLabel: "2026-27" },
  SERIE_A: { start: "2026-08-01", seasonLabel: "2026-27" },
  LIGUE_1: { start: "2026-08-01", seasonLabel: "2026-27" },
  SUPER_LIG: { start: "2026-08-01", seasonLabel: "2026-27" },
  K_LEAGUE_1: { start: "2026-02-15", seasonLabel: "2026" },
  K_LEAGUE_2: { start: "2026-02-15", seasonLabel: "2026" },
  J1_LEAGUE: { start: "2026-02-01", seasonLabel: "2026" },
};

export interface SubImpactPlayerRow {
  id: string; // ts player id
  name: string;
  nameKo: string | null;
  teamId: number;
  teamKo: string;
  subOn: number; // 교체 투입 횟수
  goals: number; // 투입 후 골
  assists: number; // 투입 후 도움
}

export interface SubImpactTeamRow {
  teamId: number;
  nameKo: string;
  coachKo: string | null;
  games: number; // 교체 데이터 있는 경기 수
  avgSubs: number;
  avgFirstSubMin: number | null;
  jokerGoals: number;
  jokerAssists: number;
  goalsAfterSub: number; // 자기 팀 첫 교체 이후 득점
  concededAfterSub: number;
  trailingAtSub: number; // 첫 교체 시점에 뒤지던 경기
  trailingRecovered: number; // 그중 무승부 이상으로 마친 경기
  trailingPoints: number; // 그 경기들에서 딴 승점
  formations: { formation: string; count: number; w: number; d: number; l: number }[];
}

export interface SubImpactLeagueData {
  league: string;
  seasonLabel: string;
  games: number; // 집계에 실제 쓰인 경기 수
  totalFinished: number; // 시즌 종료 경기 수 (커버리지 표시용)
  teams: SubImpactTeamRow[];
  jokers: SubImpactPlayerRow[];
  updatedAt: string;
}

interface TsIncident {
  time?: number;
  second?: number;
  type?: number;
  position?: number; // 1=홈 2=원정
  player_id?: string;
  player_name?: string;
  assist1_id?: string;
  assist1_name?: string;
  in_player_id?: string;
  in_player_name?: string;
  out_player_id?: string;
  home_score?: number;
  away_score?: number;
}

const COACHES = rawCoaches as Record<string, { id?: string; nameKo?: string | null; name?: string }>;
// 감독 한글명 2차 폴백 — team-coaches nameKo 누락분 (코치 페이지와 동일 사전)
const COACH_PHOTOS = rawCoachPhotos as Record<string, { nameKo?: string }>;

function parseLineup(raw: unknown): { formation?: string; coach?: string } | null {
  if (!raw) return null;
  try {
    const p = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (p && typeof p === "object") return p as { formation?: string; coach?: string };
  } catch {
    /* 파싱 불가 라인업은 포메이션 집계만 건너뜀 */
  }
  return null;
}

/** incident 정렬 키 — second 가 있으면 정밀, 없으면 분*60. */
const incSec = (i: TsIncident) => i.second ?? (i.time ?? 0) * 60;

export async function aggregateLeagueSubImpact(league: string): Promise<SubImpactLeagueData | null> {
  const conf = SUB_IMPACT_LEAGUES[league];
  if (!conf) return null;

  const matches = await prisma.match.findMany({
    where: { league, status: "FINISHED", startTime: { gte: new Date(conf.start) } },
    select: {
      id: true,
      startTime: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      lineupHome: true,
      lineupAway: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });
  const totalFinished = matches.length;

  const caches = await prisma.theSportsMatchCache.findMany({
    where: { matchId: { in: matches.map((m) => m.id) } },
    select: { matchId: true, detailLive: true },
  });
  const incByMatch = new Map<number, TsIncident[]>();
  for (const c of caches) {
    const inc = (c.detailLive as { incidents?: TsIncident[] } | null)?.incidents;
    if (Array.isArray(inc) && inc.length > 0) incByMatch.set(c.matchId, inc);
  }

  interface TeamAcc {
    teamId: number;
    name: string;
    games: number;
    subs: number;
    firstSubMinSum: number;
    firstSubGames: number;
    jokerGoals: number;
    jokerAssists: number;
    goalsAfterSub: number;
    concededAfterSub: number;
    trailingAtSub: number;
    trailingRecovered: number;
    trailingPoints: number;
    formations: Map<string, { count: number; w: number; d: number; l: number }>;
    lastCoach: string | null;
  }
  const teams = new Map<number, TeamAcc>();
  const acc = (id: number, name: string): TeamAcc => {
    let t = teams.get(id);
    if (!t) {
      t = {
        teamId: id, name, games: 0, subs: 0, firstSubMinSum: 0, firstSubGames: 0,
        jokerGoals: 0, jokerAssists: 0, goalsAfterSub: 0, concededAfterSub: 0,
        trailingAtSub: 0, trailingRecovered: 0, trailingPoints: 0,
        formations: new Map(), lastCoach: null,
      };
      teams.set(id, t);
    }
    return t;
  };

  interface PlayerAcc { id: string; name: string; teamId: number; subOn: number; goals: number; assists: number }
  const players = new Map<string, PlayerAcc>();
  const pacc = (id: string, name: string, teamId: number): PlayerAcc => {
    let p = players.get(id);
    if (!p) {
      p = { id, name, teamId, subOn: 0, goals: 0, assists: 0 };
      players.set(id, p);
    }
    return p;
  };

  let games = 0;
  for (const m of matches) {
    if (m.homeScore == null || m.awayScore == null) continue;
    const inc = incByMatch.get(m.id);
    if (!inc) continue;

    const sorted = [...inc].sort((a, b) => incSec(a) - incSec(b));
    const subs = sorted.filter((i) => i.type === 9 && (i.position === 1 || i.position === 2));
    // 교체 데이터 자체가 없는 경기는 커버리지 결손으로 보고 표본에서 제외
    if (subs.length === 0) continue;
    games++;

    const sides: Array<{ pos: 1 | 2; teamId: number; name: string; gf: number; ga: number }> = [
      { pos: 1, teamId: m.homeTeamId, name: m.homeTeam.name, gf: m.homeScore, ga: m.awayScore },
      { pos: 2, teamId: m.awayTeamId, name: m.awayTeam.name, gf: m.awayScore, ga: m.homeScore },
    ];

    // 포메이션·감독 (라인업은 문자열 JSON)
    const lus = [parseLineup(m.lineupHome), parseLineup(m.lineupAway)];
    for (const s of sides) {
      const t = acc(s.teamId, s.name);
      const lu = lus[s.pos - 1];
      if (lu?.coach) t.lastCoach = String(lu.coach);
      if (lu?.formation) {
        const f = t.formations.get(lu.formation) ?? { count: 0, w: 0, d: 0, l: 0 };
        f.count++;
        if (s.gf > s.ga) f.w++;
        else if (s.gf === s.ga) f.d++;
        else f.l++;
        t.formations.set(lu.formation, f);
      }
    }

    // 골 이벤트(자책 포함) 로 시점별 스코어 재구성. 조커 귀속은 일반 골(1)·PK 골(8)만.
    const goals = sorted.filter(
      (i) => i.home_score != null && i.away_score != null && i.type !== 9,
    );

    for (const s of sides) {
      const t = acc(s.teamId, s.name);
      t.games++;
      const mySubs = subs.filter((i) => i.position === s.pos);
      t.subs += mySubs.length;

      for (const sub of mySubs) {
        if (sub.in_player_id) pacc(sub.in_player_id, sub.in_player_name ?? "?", s.teamId).subOn++;
      }

      const first = mySubs[0];
      if (first?.time != null) {
        t.firstSubMinSum += first.time;
        t.firstSubGames++;

        // 첫 교체 시점 스코어 = 그 직전 마지막 골 incident 의 스코어 필드
        let h = 0, a = 0;
        for (const g of goals) {
          if (incSec(g) > incSec(first)) break;
          h = g.home_score ?? h;
          a = g.away_score ?? a;
        }
        const myAtSub = s.pos === 1 ? h : a;
        const oppAtSub = s.pos === 1 ? a : h;
        if (myAtSub < oppAtSub) {
          t.trailingAtSub++;
          if (s.gf >= s.ga) t.trailingRecovered++;
          t.trailingPoints += s.gf > s.ga ? 3 : s.gf === s.ga ? 1 : 0;
        }
        // 첫 교체 이후 득실 (스코어 필드 기준 — 자책 방향까지 정확)
        t.goalsAfterSub += s.gf - myAtSub;
        t.concededAfterSub += s.ga - oppAtSub;
      }

      // 조커 골·도움 — 같은 사이드에서 먼저 투입된 선수의 이후 기록
      const inAt = new Map<string, number>();
      for (const sub of mySubs) if (sub.in_player_id) inAt.set(sub.in_player_id, incSec(sub));
      for (const g of goals) {
        if (g.position !== s.pos || (g.type !== 1 && g.type !== 8)) continue;
        const gs = incSec(g);
        if (g.player_id && (inAt.get(g.player_id) ?? Infinity) < gs) {
          t.jokerGoals++;
          pacc(g.player_id, g.player_name ?? "?", s.teamId).goals++;
        }
        if (g.assist1_id && (inAt.get(g.assist1_id) ?? Infinity) < gs) {
          t.jokerAssists++;
          pacc(g.assist1_id, g.assist1_name ?? "?", s.teamId).assists++;
        }
      }
    }
  }

  // 감독 한글명 — 우리 Team → ts team id → team-coaches.json
  const teamIds = [...teams.keys()];
  const tsMap = await prisma.teamSourceId.findMany({
    where: { league, source: "thesports", teamId: { in: teamIds } },
    select: { teamId: true, externalId: true },
  });
  const tsByTeam = new Map(tsMap.map((r) => [r.teamId, r.externalId]));

  // 선수 한글명 (잠금 사전이 반영된 DB nameKo)
  const pids = [...players.keys()];
  const tsPlayers = pids.length
    ? await prisma.theSportsPlayer.findMany({
        where: { id: { in: pids } },
        select: { id: true, nameKo: true },
      })
    : [];
  const koByPid = new Map(tsPlayers.map((p) => [p.id, p.nameKo]));

  const teamRows: SubImpactTeamRow[] = [...teams.values()]
    .filter((t) => t.games > 0)
    .map((t) => {
      const tsId = tsByTeam.get(t.teamId);
      const coach = tsId ? COACHES[tsId] : undefined;
      const coachKo =
        coach?.nameKo ??
        (coach?.id ? COACH_PHOTOS[coach.id]?.nameKo : undefined) ??
        coach?.name ??
        t.lastCoach;
      return {
        teamId: t.teamId,
        nameKo: toKoreanTeamName(t.name, league),
        coachKo,
        games: t.games,
        avgSubs: Math.round((t.subs / t.games) * 10) / 10,
        avgFirstSubMin: t.firstSubGames ? Math.round(t.firstSubMinSum / t.firstSubGames) : null,
        jokerGoals: t.jokerGoals,
        jokerAssists: t.jokerAssists,
        goalsAfterSub: t.goalsAfterSub,
        concededAfterSub: t.concededAfterSub,
        trailingAtSub: t.trailingAtSub,
        trailingRecovered: t.trailingRecovered,
        trailingPoints: t.trailingPoints,
        formations: [...t.formations.entries()]
          .map(([formation, f]) => ({ formation, ...f }))
          .sort((x, y) => y.count - x.count),
      };
    })
    .sort((x, y) => y.trailingPoints - x.trailingPoints || y.jokerGoals - x.jokerGoals);

  const jokers: SubImpactPlayerRow[] = [...players.values()]
    .filter((p) => p.goals + p.assists > 0)
    .sort((x, y) => y.goals - x.goals || y.assists - x.assists || y.subOn - x.subOn)
    .slice(0, 20)
    .map((p) => {
      const t = teams.get(p.teamId);
      return {
        id: p.id,
        name: p.name,
        nameKo: koByPid.get(p.id) ?? null,
        teamId: p.teamId,
        teamKo: t ? toKoreanTeamName(t.name, league) : "",
        subOn: p.subOn,
        goals: p.goals,
        assists: p.assists,
      };
    });

  return {
    league,
    seasonLabel: conf.seasonLabel,
    games,
    totalFinished,
    teams: teamRows,
    jokers,
    updatedAt: new Date().toISOString(),
  };
}

/** 전 리그 재계산 + SubImpactCache upsert. cron 에서 호출. */
export async function buildSubImpact(): Promise<{ leagues: number; games: number }> {
  let leagues = 0;
  let games = 0;
  for (const league of Object.keys(SUB_IMPACT_LEAGUES)) {
    const data = await aggregateLeagueSubImpact(league);
    if (!data) continue;
    await prisma.subImpactCache.upsert({
      where: { league },
      create: { league, data: data as object },
      update: { data: data as object },
    });
    leagues++;
    games += data.games;
  }
  return { leagues, games };
}
