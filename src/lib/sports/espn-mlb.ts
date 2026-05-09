// ESPN 비공식 MLB scoreboard API. NBA/NHL 과 같은 패턴.

import axios from "axios";
import type {
  MatchCollector,
  MatchStatus,
  NormalizedMatch,
} from "./types";

const BASE_URL = "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb";

interface EspnTeam {
  id: string;
  displayName: string;
  abbreviation?: string;
  logo?: string;
}
interface EspnCompetitor {
  homeAway: "home" | "away";
  team: EspnTeam;
  score?: string;
}
interface EspnEvent {
  id: string;
  date: string;
  name?: string;
  status?: {
    type?: { state?: string; completed?: boolean; description?: string };
  };
  competitions?: Array<{ competitors: EspnCompetitor[] }>;
}

function mapStatus(state: string | undefined, completed: boolean): MatchStatus {
  if (state === "post" || completed) return "FINISHED";
  if (state === "in") return "LIVE";
  return "SCHEDULED";
}

function ymd(d: string | Date) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

export async function fetchEspnMlbByDate(
  date: string,
): Promise<NormalizedMatch[]> {
  const { data } = await axios.get<{ events?: EspnEvent[] }>(
    `${BASE_URL}/scoreboard`,
    { params: { dates: ymd(date) }, timeout: 15000 },
  );

  const events = data?.events ?? [];
  return events.map((e): NormalizedMatch => {
    const comp = e.competitions?.[0];
    const competitors = comp?.competitors ?? [];
    const homeC = competitors.find((c) => c.homeAway === "home");
    const awayC = competitors.find((c) => c.homeAway === "away");
    const homeScore = homeC?.score ? Number(homeC.score) : undefined;
    const awayScore = awayC?.score ? Number(awayC.score) : undefined;

    return {
      league: "MLB",
      externalId: String(e.id),
      homeTeam: {
        externalId: String(homeC?.team.id ?? ""),
        name: homeC?.team.displayName ?? "",
        shortName: homeC?.team.abbreviation,
        logoUrl: homeC?.team.logo,
      },
      awayTeam: {
        externalId: String(awayC?.team.id ?? ""),
        name: awayC?.team.displayName ?? "",
        shortName: awayC?.team.abbreviation,
        logoUrl: awayC?.team.logo,
      },
      homeScore: Number.isFinite(homeScore) ? homeScore : undefined,
      awayScore: Number.isFinite(awayScore) ? awayScore : undefined,
      status: mapStatus(
        e.status?.type?.state,
        Boolean(e.status?.type?.completed),
      ),
      startTime: new Date(e.date),
      raw: e,
    };
  });
}

export const mlbCollectorEspn: MatchCollector = {
  league: "MLB",
  async fetchByDate(date: string): Promise<NormalizedMatch[]> {
    return fetchEspnMlbByDate(date);
  },
};
