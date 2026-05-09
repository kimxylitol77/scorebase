// ESPN 비공식 축구 scoreboard API.
// 리그 코드별로 collector 를 만들어 export.
//   - 라리가:        soccer/esp.1
//   - 분데스리가:     soccer/ger.1
//   - 세리에A:        soccer/ita.1
//   - 리그앙:         soccer/fra.1
//   - MLS:           soccer/usa.1
//   - 챔피언스리그:    soccer/uefa.champions

import axios from "axios";
import type {
  League,
  MatchCollector,
  MatchStatus,
  NormalizedMatch,
} from "./types";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";

export const SOCCER_LEAGUE_CODES: Partial<Record<League, string>> = {
  EPL: "eng.1",
  LALIGA: "esp.1",
  BUNDESLIGA: "ger.1",
  SERIE_A: "ita.1",
  LIGUE_1: "fra.1",
  MLS: "usa.1",
  UCL: "uefa.champions",
};

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

export async function fetchEspnSoccerByDate(
  league: League,
  date: string,
): Promise<NormalizedMatch[]> {
  const code = SOCCER_LEAGUE_CODES[league];
  if (!code) {
    throw new Error(`ESPN soccer code 없음: ${league}`);
  }

  const { data } = await axios.get<{ events?: EspnEvent[] }>(
    `${BASE}/${code}/scoreboard`,
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
      league,
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

export function buildSoccerCollector(league: League): MatchCollector {
  return {
    league,
    async fetchByDate(date: string): Promise<NormalizedMatch[]> {
      return fetchEspnSoccerByDate(league, date);
    },
  };
}
