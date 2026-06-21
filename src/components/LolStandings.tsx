// LCK 순위·통계 — 데이터 집계(server) → LolStandingsTabs(client 탭 UI). 팀순위=json, 통계=lolGames 집계.
// 선수 사진=lol-players.json, 챔피언 아이콘=lol-heroes.json 조인.
import rawStandings from "../../data/lol-standings.json";
import lolPlayersData from "../../data/lol-players.json";
import lolHeroesData from "../../data/lol-heroes.json";
import {
  aggregateLolPlayers,
  aggregateLolChampions,
  aggregateLolBans,
  aggregateLolTeams,
} from "@/lib/sports/lol-player-stats";
import LolStandingsTabs from "./LolStandingsTabs";

interface Row {
  rank: number;
  teamId: string;
  name: string;
  short: string;
  logo: string;
  win: number;
  lose: number;
  dbId: number | null;
}
interface Data {
  league: string;
  name: string;
  updatedAt: string;
  standings: Row[];
}

export default async function LolStandings({ name }: { name: string }) {
  const data = rawStandings as Data;
  const teamShort = new Map(data.standings.map((r) => [r.teamId, r.short]));
  const photos = (lolPlayersData as { players: Record<string, { photo?: string }> }).players;
  const heroLogos = (lolHeroesData as { heroes: Record<string, string> }).heroes;

  const [playersAll, champs, bans, teams] = await Promise.all([
    aggregateLolPlayers(),
    aggregateLolChampions(),
    aggregateLolBans(),
    aggregateLolTeams(),
  ]);

  const players = playersAll
    .filter((p) => p.games >= 10)
    .sort((a, b) => b.kda - a.kda)
    .slice(0, 20)
    .map((p) => ({
      playerId: p.playerId,
      name: p.name,
      teamShort: teamShort.get(p.teamId) ?? "",
      photo: photos[p.playerId]?.photo ?? "",
      kda: p.kda,
      winRate: p.winRate,
      csPerMin: p.csPerMin,
      games: p.games,
    }));

  const champRows = champs.slice(0, 20).map((c) => ({
    champ: c.champ,
    logo: heroLogos[c.champ] ?? "",
    picks: c.picks,
    winRate: c.winRate,
  }));

  const banRows = bans.slice(0, 20).map((b) => ({
    champ: b.champ,
    logo: heroLogos[b.champ] ?? "",
    bans: b.bans,
  }));

  const teamMeta = new Map(data.standings.map((r) => [r.teamId, { logo: r.logo, dbId: r.dbId }]));
  const teamRows = teams.map((t) => ({
    teamId: t.teamId,
    name: t.name,
    logo: teamMeta.get(t.teamId)?.logo ?? "",
    dbId: teamMeta.get(t.teamId)?.dbId ?? null,
    avgKills: t.avgKills,
    avgDragons: t.avgDragons,
    avgTowers: t.avgTowers,
    avgMin: t.avgMin,
  }));

  const standings = data.standings.map((r) => ({
    rank: r.rank,
    teamId: r.teamId,
    name: r.name,
    logo: r.logo,
    win: r.win,
    lose: r.lose,
    dbId: r.dbId,
  }));

  return (
    <LolStandingsTabs
      name={name}
      updatedAt={data.updatedAt}
      standings={standings}
      players={players}
      champs={champRows}
      bans={banRows}
      teams={teamRows}
    />
  );
}
