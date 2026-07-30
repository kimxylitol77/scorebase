import axios from "axios";
import type {
  MatchCollector,
  MatchStatus,
  NormalizedMatch,
} from "./types";

// MySportsFeeds NBA 데이터
// 인증: HTTP Basic Auth (username:password — password 는 보통 "MYSPORTSFEEDS")
// 문서: https://www.mysportsfeeds.com/data-feeds/api-docs/
const BASE_URL = "https://api.mysportsfeeds.com/v2.1/pull/nba";

function getSeasonSlug(date: string): string {
  // NBA 시즌 표기: "YYYY-YYYY-regular" 형식
  // 정규시즌 시작 ~10월, 종료 ~4월. 플레이오프 별도.
  const d = new Date(date);
  const year = d.getFullYear();
  if (d.getMonth() >= 9) {
    return `${year}-${year + 1}-regular`;
  }
  return `${year - 1}-${year}-regular`;
}

function authHeader(): string {
  const user = process.env.MYSPORTSFEEDS_USER ?? "";
  const pass = process.env.MYSPORTSFEEDS_PASS ?? "MYSPORTSFEEDS";
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

function mapStatus(s: string): MatchStatus {
  const upper = (s ?? "").toUpperCase();
  if (upper === "COMPLETED" || upper === "COMPLETED_PENDING_REVIEW")
    return "FINISHED";
  if (upper === "LIVE") return "LIVE";
  if (upper === "POSTPONED") return "POSTPONED";
  return "SCHEDULED";
}

export const nbaCollector: MatchCollector = {
  league: "NBA",

  async fetchByDate(date: string): Promise<NormalizedMatch[]> {
    if (!process.env.MYSPORTSFEEDS_USER) {
      throw new Error("MYSPORTSFEEDS_USER 가 설정되지 않았습니다.");
    }

    const season = getSeasonSlug(date);
    const ymd = date.replace(/-/g, ""); // YYYY-MM-DD -> YYYYMMDD

    const { data } = await axios.get(
      `${BASE_URL}/${season}/games.json`,
      {
        headers: { Authorization: authHeader() },
        params: { date: ymd },
        timeout: 15000,
      },
    );

    // MSF 응답 — 우리가 읽는 필드만 옵셔널로 적는다(공식 타입 패키지 없음).
    interface MsfTeam { id?: number | string; city?: string; name?: string; abbreviation?: string }
    interface MsfGame {
      schedule: { id: number | string; homeTeam: MsfTeam; awayTeam: MsfTeam; playedStatus: string; startTime: string };
      score?: { homeScoreTotal?: number | null; awayScoreTotal?: number | null };
    }
    const games = (data?.games ?? []) as MsfGame[];

    return games.map((g): NormalizedMatch => {
      const home = g.schedule.homeTeam;
      const away = g.schedule.awayTeam;
      const score = g.score ?? {};
      return {
        league: "NBA",
        externalId: String(g.schedule.id),
        homeTeam: {
          externalId: String(home.id),
          name: `${home.city ?? ""} ${home.name ?? ""}`.trim(),
          shortName: home.abbreviation,
        },
        awayTeam: {
          externalId: String(away.id),
          name: `${away.city ?? ""} ${away.name ?? ""}`.trim(),
          shortName: away.abbreviation,
        },
        homeScore: score.homeScoreTotal ?? undefined,
        awayScore: score.awayScoreTotal ?? undefined,
        status: mapStatus(g.schedule.playedStatus),
        startTime: new Date(g.schedule.startTime),
        raw: g,
      };
    });
  },
};
