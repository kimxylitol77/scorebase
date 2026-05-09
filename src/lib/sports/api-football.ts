import axios from "axios";
import type {
  MatchCollector,
  MatchStatus,
  NormalizedMatch,
} from "./types";

const BASE_URL = "https://v3.football.api-sports.io";
const EPL_LEAGUE_ID = 39; // Premier League

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    "x-apisports-key": process.env.API_FOOTBALL_KEY ?? "",
  },
});

function mapStatus(short: string): MatchStatus {
  // api-football fixture status codes
  if (["FT", "AET", "PEN"].includes(short)) return "FINISHED";
  if (["1H", "HT", "2H", "ET", "BT", "P", "LIVE"].includes(short))
    return "LIVE";
  if (short === "PST" || short === "CANC" || short === "ABD")
    return "POSTPONED";
  return "SCHEDULED";
}

function getSeasonFromDate(date: string): number {
  // EPL 시즌은 8월 ~ 다음해 5월. 7월 이후면 해당 연도, 이전이면 전년도.
  const d = new Date(date);
  return d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
}

export const eplCollector: MatchCollector = {
  league: "EPL",

  async fetchByDate(date: string): Promise<NormalizedMatch[]> {
    if (!process.env.API_FOOTBALL_KEY) {
      throw new Error("API_FOOTBALL_KEY 가 설정되지 않았습니다.");
    }

    const { data } = await client.get("/fixtures", {
      params: {
        league: EPL_LEAGUE_ID,
        date,
        season: getSeasonFromDate(date),
      },
    });

    const fixtures = (data?.response ?? []) as any[];

    return fixtures.map((f): NormalizedMatch => ({
      league: "EPL",
      externalId: String(f.fixture.id),
      homeTeam: {
        externalId: String(f.teams.home.id),
        name: f.teams.home.name,
        logoUrl: f.teams.home.logo,
      },
      awayTeam: {
        externalId: String(f.teams.away.id),
        name: f.teams.away.name,
        logoUrl: f.teams.away.logo,
      },
      homeScore: f.goals?.home ?? undefined,
      awayScore: f.goals?.away ?? undefined,
      status: mapStatus(f.fixture?.status?.short ?? ""),
      startTime: new Date(f.fixture.date),
      raw: f,
    }));
  },
};
