import axios from "axios";
import { afGoalsExcludingShootout, type AfScoreBreakdown } from "./api-football-pro";
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

    // api-football fixtures 응답 — 읽는 필드만 명시.
    interface AfTeamRef { id: number | string; name: string; logo?: string }
    interface AfFixtureItem {
      fixture: { id: number | string; date: string; status?: { short?: string } };
      teams: { home: AfTeamRef; away: AfTeamRef };
      goals?: { home?: number | null; away?: number | null } | null;
      score?: AfScoreBreakdown | null;
    }
    const fixtures = (data?.response ?? []) as AfFixtureItem[];

    return fixtures.map((f): NormalizedMatch => {
      const g = afGoalsExcludingShootout(f.fixture?.status?.short, f.goals, f.score);
      return {
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
        homeScore: g.home ?? undefined,
        awayScore: g.away ?? undefined,
        status: mapStatus(f.fixture?.status?.short ?? ""),
        startTime: new Date(f.fixture.date),
        raw: f,
      };
    });
  },
};
