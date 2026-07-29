// ESPN 비공식 MLB scoreboard API. NBA/NHL 과 같은 패턴.

import axios from "axios";
import type {
  MatchCollector,
  MatchStatus,
  NormalizedMatch,
} from "./types";
import { isBaseballAllStarMatch } from "./baseball/allstar";

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
    type?: {
      state?: string;
      name?: string;
      completed?: boolean;
      description?: string;
    };
  };
  competitions?: Array<{ competitors: EspnCompetitor[] }>;
}

// ESPN status.type.name 우선 판정. 연기/취소 경기는 예정시각이 지나면 state="post" 로
// 오지만 completed=false + name=STATUS_POSTPONED/CANCELED 다 — 기존 `state==="post"
// → FINISHED` 가 이를 0-0 FINISHED 로 오기록했음 (2026-06 fix, MLB 16건 정정).
function mapStatus(
  type: { state?: string; name?: string; completed?: boolean } | undefined,
): MatchStatus {
  const name = type?.name ?? "";
  if (
    name === "STATUS_POSTPONED" ||
    name === "STATUS_CANCELED" ||
    name === "STATUS_CANCELLED"
  ) {
    return "POSTPONED";
  }
  if (type?.completed) return "FINISHED";
  if (type?.state === "in") return "LIVE";
  // 연기/취소 분기 뒤이므로 안전 — completed 플래그 못 받은 종료 직후 보강.
  if (type?.state === "post") return "FINISHED";
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
  const normalized = events.map((e): NormalizedMatch => {
    const comp = e.competitions?.[0];
    const competitors = comp?.competitors ?? [];
    const homeC = competitors.find((c) => c.homeAway === "home");
    const awayC = competitors.find((c) => c.homeAway === "away");
    const homeScore = homeC?.score ? Number(homeC.score) : undefined;
    const awayScore = awayC?.score ? Number(awayC.score) : undefined;
    const status = mapStatus(e.status?.type);
    // 연기/취소는 ESPN 이 0-0 score 를 주지만 무의미 → score 미기록(undefined → upsert 시 null).
    const scored = status !== "POSTPONED";

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
      homeScore: scored && Number.isFinite(homeScore) ? homeScore : undefined,
      awayScore: scored && Number.isFinite(awayScore) ? awayScore : undefined,
      status,
      startTime: new Date(e.date),
      raw: e,
    };
  });
  // 올스타전(American vs National All-Stars)은 정규 리그 팀이 아니라 파워랭킹·순위를 오염시킨다 → 제외
  return normalized.filter((m) => !isBaseballAllStarMatch(m));
}

export const mlbCollectorEspn: MatchCollector = {
  league: "MLB",
  async fetchByDate(date: string): Promise<NormalizedMatch[]> {
    return fetchEspnMlbByDate(date);
  },
};
