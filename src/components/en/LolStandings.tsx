// LolStandings (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
import rawStandings from "../../../data/lol-standings.json";
import lolPlayersData from "../../../data/lol-players.json";
import lolHeroesData from "../../../data/lol-heroes.json";
import {
  aggregateLolPlayers,
  aggregateLolChampions,
  aggregateLolBans,
  aggregateLolTeams,
} from "@/lib/sports/lol-player-stats";
import LolStandingsTabs from "./LolStandingsTabs";
import { lolTeamNameEn } from "@/lib/sports/lol-teams";

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
  const teamById = new Map(data.standings.map((r) => [r.teamId, r]));
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
    .map((p) => {
      const team = teamById.get(p.teamId);
      return {
        playerId: p.playerId,
        name: p.name,
        teamName: lolTeamNameEn(p.teamId) ?? team?.name ?? "",
        teamLogo: team?.logo ?? "",
        teamDbId: team?.dbId ?? null,
        photo: photos[p.playerId]?.photo ?? "",
        kda: p.kda,
        winRate: p.winRate,
        csPerMin: p.csPerMin,
        games: p.games,
      };
    });

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

  const teamRows = teams.map((t) => ({
    teamId: t.teamId,
    name: lolTeamNameEn(t.teamId) ?? t.name,
    logo: teamById.get(t.teamId)?.logo ?? "",
    dbId: teamById.get(t.teamId)?.dbId ?? null,
    avgKills: t.avgKills,
    avgDragons: t.avgDragons,
    avgTowers: t.avgTowers,
    avgMin: t.avgMin,
  }));

  const standings = data.standings.map((r) => ({
    rank: r.rank,
    teamId: r.teamId,
    name: lolTeamNameEn(r.teamId) ?? r.name,
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
