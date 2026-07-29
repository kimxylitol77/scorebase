// ESPN 비공식 NHL scoreboard API.
// 무료, 인증 X. NBA 클라이언트와 같은 패턴.

import axios from "axios";
import type {
  MatchCollector,
  MatchStatus,
  NormalizedMatch,
} from "./types";

const BASE_URL = "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl";

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

export async function fetchEspnNhlByDate(
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
    const status = mapStatus(
      e.status?.type?.state,
      Boolean(e.status?.type?.completed),
    );
    // ESPN 은 시작 전 경기에도 score "0" 을 준다 → 시작 전이면 미기록(예정 카드 0-0 방지).
    const scored = status === "LIVE" || status === "FINISHED";

    return {
      league: "NHL",
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
      homeScore: scored && Number.isFinite(homeScore) ? homeScore : undefined,
      awayScore: scored && Number.isFinite(awayScore) ? awayScore : undefined,
      status,
      startTime: new Date(e.date),
      raw: e,
    };
  });
}

export const nhlCollectorEspn: MatchCollector = {
  league: "NHL",
  async fetchByDate(date: string): Promise<NormalizedMatch[]> {
    return fetchEspnNhlByDate(date);
  },
};
