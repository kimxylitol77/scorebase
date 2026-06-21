// LOL 선수 시즌 집계 — DB lolGames 파싱 → 선수별 KDA·CS·챔프폭. 선수랭킹·선수카드 공용.
import { prisma } from "@/lib/db";

export interface LolPlayerAgg {
  playerId: string;
  name: string;
  teamId: string;
  games: number; // 세트 수
  kills: number;
  deaths: number;
  assists: number;
  kda: number; // (K+A)/D (데스 0 이면 K+A)
  csPerGame: number;
  champs: string[];
}

interface Acc {
  playerId: string;
  name: string;
  teamId: string;
  games: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  champs: Set<string>;
}

interface LolGameRow {
  sets: {
    players: {
      playerId: string;
      name: string;
      teamId: string;
      k: number;
      d: number;
      a: number;
      cs: number;
      champ: string;
    }[];
  }[];
}

// DB lolGames 전체 → 선수별 집계 배열 (정렬은 호출측).
export async function aggregateLolPlayers(): Promise<LolPlayerAgg[]> {
  const matches = await prisma.match.findMany({
    where: { league: "LOL", lolGames: { not: null } },
    select: { lolGames: true },
  });
  const agg = new Map<string, Acc>();
  for (const m of matches) {
    const d = JSON.parse(m.lolGames!) as LolGameRow;
    for (const s of d.sets)
      for (const p of s.players) {
        if (!p.playerId) continue;
        let a = agg.get(p.playerId);
        if (!a) {
          a = {
            playerId: p.playerId,
            name: p.name,
            teamId: p.teamId,
            games: 0,
            kills: 0,
            deaths: 0,
            assists: 0,
            cs: 0,
            champs: new Set(),
          };
          agg.set(p.playerId, a);
        }
        a.games++;
        a.kills += p.k;
        a.deaths += p.d;
        a.assists += p.a;
        a.cs += p.cs;
        a.champs.add(p.champ);
      }
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
    champs: [...a.champs],
  }));
}
