// ESPN 비공식 MLB scoreboard API. NBA/NHL 과 같은 패턴.

import { hasRealEspnTeams } from "./espn-placeholder";
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

async function fetchScoreboard(dates: string): Promise<NormalizedMatch[]> {
  const { data } = await axios.get<{ events?: EspnEvent[] }>(
    `${BASE_URL}/scoreboard`,
    { params: { dates, limit: 1000 }, timeout: 20000 },
  );

  // 포스트시즌 자리표시자(음수 id 가짜 팀) 경기는 대진 확정 전까지 저장하지 않는다 — espn-placeholder.ts
  const events = (data?.events ?? []).filter(hasRealEspnTeams);
  return events.map((e): NormalizedMatch => {
    const comp = e.competitions?.[0];
    const competitors = comp?.competitors ?? [];
    const homeC = competitors.find((c) => c.homeAway === "home");
    const awayC = competitors.find((c) => c.homeAway === "away");
    const homeScore = homeC?.score ? Number(homeC.score) : undefined;
    const awayScore = awayC?.score ? Number(awayC.score) : undefined;
    const status = mapStatus(e.status?.type);
    // ESPN 은 시작 전·연기·취소 경기에도 score "0" 을 실어 보낸다 → 무의미하므로 미기록
    // (undefined → upsert 시 null). 시작 전까지 포함하지 않으면 예정 카드가 0-0 으로 뜬다
    // (2026-07-29 실측 — MLB 예정 819경기가 DB 에 0-0 으로 저장돼 /scores 에 노출).
    const scored = status === "LIVE" || status === "FINISHED";

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
}

export async function fetchEspnMlbByDate(
  date: string,
): Promise<NormalizedMatch[]> {
  return fetchScoreboard(ymd(date));
}

/**
 * 날짜 범위를 한 번에 조회 (ESPN scoreboard 는 dates=YYYYMMDD-YYYYMMDD 지원).
 * 시즌 잔여 일정 선적재용 — collect cron 의 +7일 창 밖 매치를 월 1회 호출로 채운다.
 * 범위 응답이 per-date 합과 동일한 것은 실측 확인 (2026-08-01~07, 94건 id 집합 일치).
 */
export async function fetchEspnMlbRange(
  from: string,
  to: string,
): Promise<NormalizedMatch[]> {
  try {
    return await fetchScoreboard(`${ymd(from)}-${ymd(to)}`);
  } catch (e) {
    // 2026-09-28 실측: ESPN 이 범위 조회를 전 종목에서 400("Failed to get events endpoint")으로 거부했다.
    // 하루 단위 조회는 정상이라 날짜별로 나눠 받는다. 400 이 아닌 오류(타임아웃 등)는 그대로 올린다.
    if (!axios.isAxiosError(e) || e.response?.status !== 400) throw e;
    const days: string[] = [];
    for (let d = new Date(from + "T00:00:00Z"); d <= new Date(to + "T00:00:00Z"); d = new Date(d.getTime() + 86_400_000)) {
      days.push(ymd(d));
    }
    const out = new Map<string, NormalizedMatch>();
    for (let i = 0; i < days.length; i += 5) {
      const chunk = await Promise.all(days.slice(i, i + 5).map((d) => fetchScoreboard(d)));
      // ESPN 은 미국 날짜로 끊어 주므로 자정 근처 경기가 이틀에 걸쳐 올 수 있다 — id 로 합친다
      for (const m of chunk.flat()) out.set(m.externalId, m);
    }
    return [...out.values()];
  }
}

export const mlbCollectorEspn: MatchCollector = {
  league: "MLB",
  async fetchByDate(date: string): Promise<NormalizedMatch[]> {
    return fetchEspnMlbByDate(date);
  },
};
