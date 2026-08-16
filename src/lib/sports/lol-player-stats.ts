// LOL 시즌 집계 — DB lolGames 파싱 → 선수·챔피언·팀·밴 통계. 선수랭킹·선수카드·강화 통계 공용.
import { prisma } from "@/lib/db";
import { LOL_LEAGUES } from "@/lib/sports/sport-leagues";

export interface LolPlayerAgg {
  playerId: string;
  name: string;
  teamId: string;
  games: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  csPerGame: number;
  csPerMin: number;
  wins: number;
  winRate: number; // 0~1
  champs: string[];
}

export interface LolChampAgg {
  champ: string;
  picks: number;
  players: number;
  wins: number;
  winRate: number; // 0~1
}

export interface LolBanAgg {
  champ: string;
  bans: number;
}

export interface LolTeamAgg {
  teamId: string;
  name: string;
  short: string;
  sets: number;
  avgKills: number;
  avgDragons: number;
  avgTowers: number;
  avgMin: number;
}

interface SetPlayer {
  playerId: string;
  name: string;
  teamId: string;
  k: number;
  d: number;
  a: number;
  cs: number;
  champ: string;
}
interface GameSet {
  durationSec: number;
  red: { id: string; name: string; short: string };
  blue: { id: string; name: string; short: string };
  redKills: number;
  blueKills: number;
  redDragon: number;
  blueDragon: number;
  redTower: number;
  blueTower: number;
  winnerId: string;
  bans: string[];
  players: SetPlayer[];
}

async function loadSets(league: string = "LOL", since?: Date): Promise<GameSet[]> {
  const matches = await prisma.match.findMany({
    where: { league, lolGames: { not: null }, ...(since ? { startTime: { gte: since } } : {}) },
    select: { lolGames: true },
  });
  const sets: GameSet[] = [];
  for (const m of matches) {
    const d = JSON.parse(m.lolGames!) as { sets: GameSet[] };
    sets.push(...d.sets);
  }
  return sets;
}

export async function aggregateLolPlayers(league: string = "LOL", since?: Date): Promise<LolPlayerAgg[]> {
  const sets = await loadSets(league, since);
  const agg = new Map<
    string,
    { playerId: string; name: string; teamId: string; games: number; kills: number; deaths: number; assists: number; cs: number; sec: number; wins: number; champs: Set<string> }
  >();
  for (const s of sets)
    for (const p of s.players) {
      if (!p.playerId) continue;
      let a = agg.get(p.playerId);
      if (!a) {
        a = { playerId: p.playerId, name: p.name, teamId: p.teamId, games: 0, kills: 0, deaths: 0, assists: 0, cs: 0, sec: 0, wins: 0, champs: new Set() };
        agg.set(p.playerId, a);
      }
      a.games++;
      a.kills += p.k;
      a.deaths += p.d;
      a.assists += p.a;
      a.cs += p.cs;
      a.sec += s.durationSec;
      if (s.winnerId === p.teamId) a.wins++;
      a.champs.add(p.champ);
    }
  return [...agg.values()].map((a) => ({
    playerId: a.playerId,
    name: a.name,
    teamId: a.teamId,
    games: a.games,
    kills: a.kills,
    deaths: a.deaths,
    assists: a.assists,
    kda: a.deaths ? (a.kills + a.assists) / a.deaths : a.kills + a.assists,
    csPerGame: a.games ? a.cs / a.games : 0,
    csPerMin: a.sec ? a.cs / (a.sec / 60) : 0,
    wins: a.wins,
    winRate: a.games ? a.wins / a.games : 0,
    champs: [...a.champs],
  }));
}

export async function aggregateLolChampions(league: string = "LOL"): Promise<LolChampAgg[]> {
  const sets = await loadSets(league);
  const agg = new Map<string, { picks: number; wins: number; players: Set<string> }>();
  for (const s of sets)
    for (const p of s.players) {
      if (!p.champ || p.champ === "?") continue;
      const a = agg.get(p.champ) ?? { picks: 0, wins: 0, players: new Set() };
      a.picks++;
      if (s.winnerId === p.teamId) a.wins++;
      if (p.playerId) a.players.add(p.playerId);
      agg.set(p.champ, a);
    }
  return [...agg.entries()]
    .map(([champ, a]) => ({ champ, picks: a.picks, players: a.players.size, wins: a.wins, winRate: a.picks ? a.wins / a.picks : 0 }))
    .sort((x, y) => y.picks - x.picks);
}

export async function aggregateLolBans(league: string = "LOL"): Promise<LolBanAgg[]> {
  const sets = await loadSets(league);
  const agg = new Map<string, number>();
  for (const s of sets) for (const b of s.bans || []) agg.set(b, (agg.get(b) || 0) + 1);
  return [...agg.entries()].map(([champ, bans]) => ({ champ, bans })).sort((x, y) => y.bans - x.bans);
}

export async function aggregateLolTeams(league: string = "LOL"): Promise<LolTeamAgg[]> {
  const sets = await loadSets(league);
  const agg = new Map<
    string,
    { name: string; short: string; sets: number; kills: number; dragons: number; towers: number; sec: number }
  >();
  const add = (id: string, name: string, short: string, kills: number, dragons: number, towers: number, sec: number) => {
    let a = agg.get(id);
    if (!a) {
      a = { name, short, sets: 0, kills: 0, dragons: 0, towers: 0, sec: 0 };
      agg.set(id, a);
    }
    a.sets++;
    a.kills += kills;
    a.dragons += dragons;
    a.towers += towers;
    a.sec += sec;
  };
  for (const s of sets) {
    add(s.red.id, s.red.name, s.red.short, s.redKills, s.redDragon, s.redTower, s.durationSec);
    add(s.blue.id, s.blue.name, s.blue.short, s.blueKills, s.blueDragon, s.blueTower, s.durationSec);
  }
  return [...agg.entries()]
    .map(([teamId, a]) => ({
      teamId,
      name: a.name,
      short: a.short,
      sets: a.sets,
      avgKills: a.sets ? a.kills / a.sets : 0,
      avgDragons: a.sets ? a.dragons / a.sets : 0,
      avgTowers: a.sets ? a.towers / a.sets : 0,
      avgMin: a.sets ? a.sec / a.sets / 60 : 0,
    }))
    .sort((x, y) => y.avgKills - x.avgKills);
}

/* ============================================================
 * 선수 1명 상세 — 개요 집계 + 세트별 경기 로그 + 챔피언별 숙련도.
 * 선수페이지(/players/{id}?league=LOL) 3탭 전용. 한 번 로드로 셋 다 계산.
 * ==========================================================*/

export interface LolPlayerGame {
  date: Date;
  opponent: string;
  champ: string;
  k: number;
  d: number;
  a: number;
  cs: number;
  win: boolean;
  durationSec: number;
}

export interface LolPlayerChamp {
  champ: string;
  games: number;
  k: number; // 게임당 평균
  d: number;
  a: number;
  kda: number;
  wins: number;
  winRate: number; // 0~1
}

// 날짜(Match.startTime) 포함 세트 로더 — 경기 로그용.
// 선수 상세는 region 무관(LCK/LEC/LCS 어느 리그 선수든 같은 /players/[pid]?league=LOL 로 들어옴)
// 이라 전 LoL 리그 세트를 로드한다. LCK 전용으로 두면 LEC/LCS 선수가 404 가 된다.
async function loadSetsWithDate(): Promise<Array<GameSet & { date: Date }>> {
  const matches = await prisma.match.findMany({
    where: { league: { in: [...LOL_LEAGUES] }, lolGames: { not: null } },
    select: { startTime: true, lolGames: true },
  });
  const out: Array<GameSet & { date: Date }> = [];
  for (const m of matches) {
    const d = JSON.parse(m.lolGames!) as { sets: GameSet[] };
    for (const s of d.sets) out.push({ ...s, date: m.startTime });
  }
  return out;
}

export async function getLolPlayerDetail(
  playerId: string,
): Promise<{ agg: LolPlayerAgg; games: LolPlayerGame[]; champs: LolPlayerChamp[] } | null> {
  const sets = await loadSetsWithDate();
  let name = "";
  let teamId = "";
  let games = 0,
    kills = 0,
    deaths = 0,
    assists = 0,
    cs = 0,
    sec = 0,
    wins = 0;
  const champsSet = new Set<string>();
  const gameLog: LolPlayerGame[] = [];
  const champMap = new Map<string, { games: number; k: number; d: number; a: number; wins: number }>();

  for (const s of sets) {
    const me = s.players.find((p) => p.playerId === playerId);
    if (!me) continue;
    name = me.name;
    teamId = me.teamId;
    const win = s.winnerId === me.teamId;
    games++;
    kills += me.k;
    deaths += me.d;
    assists += me.a;
    cs += me.cs;
    sec += s.durationSec;
    if (win) wins++;
    champsSet.add(me.champ);
    const opp = s.red.id === me.teamId ? s.blue : s.red;
    gameLog.push({ date: s.date, opponent: opp.name, champ: me.champ, k: me.k, d: me.d, a: me.a, cs: me.cs, win, durationSec: s.durationSec });
    if (me.champ && me.champ !== "?") {
      const c = champMap.get(me.champ) ?? { games: 0, k: 0, d: 0, a: 0, wins: 0 };
      c.games++;
      c.k += me.k;
      c.d += me.d;
      c.a += me.a;
      if (win) c.wins++;
      champMap.set(me.champ, c);
    }
  }
  if (games === 0) return null;

  const agg: LolPlayerAgg = {
    playerId,
    name,
    teamId,
    games,
    kills,
    deaths,
    assists,
    kda: deaths ? (kills + assists) / deaths : kills + assists,
    csPerGame: cs / games,
    csPerMin: sec ? cs / (sec / 60) : 0,
    wins,
    winRate: wins / games,
    champs: [...champsSet],
  };
  gameLog.sort((x, y) => y.date.getTime() - x.date.getTime());
  const champs: LolPlayerChamp[] = [...champMap.entries()]
    .map(([champ, c]) => ({
      champ,
      games: c.games,
      k: c.k / c.games,
      d: c.d / c.games,
      a: c.a / c.games,
      kda: c.d ? (c.k + c.a) / c.d : c.k + c.a,
      wins: c.wins,
      winRate: c.wins / c.games,
    }))
    .sort((x, y) => y.games - x.games);

  return { agg, games: gameLog, champs };
}
