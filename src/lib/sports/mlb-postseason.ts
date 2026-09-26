// MLB 포스트시즌 대진표 조회 — statsapi(순위표·포스트시즌 시리즈) + 우리 DB(Elo·로고·팀/경기 링크)를 5분 캐시로 묶는다.
// 모델 조립 규칙은 mlb-postseason-build.ts(순수 함수).
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { calcEloTable, getElo } from "@/lib/predict/elo";
import { toKoreanTeamName } from "@/lib/team-names";
import { matchLiveHref } from "@/lib/links/match-live-link";
import { BASEBALL_KOREA_PLAYERS } from "@/lib/sports/baseball-korea";
import {
  buildMlbPostseason,
  type ApiSeries,
  type ApiStandingRecord,
  type ApiTeamRef,
  type MlbPostseason,
} from "./mlb-postseason-build";

const API = "https://statsapi.mlb.com/api/v1";

export interface MlbPostseasonPage {
  data: MlbPostseason;
  /** statsapi 팀 id → 로고 URL (우리 Team.logoUrl) */
  logoById: Record<number, string>;
  /** statsapi 팀 id → 우리 팀 페이지 id */
  teamPageById: Record<number, number>;
  /** statsapi gamePk → 우리 경기 상세 링크(수집된 경기만) */
  gameHrefByPk: Record<number, string>;
  /** 공식 시즌 날짜(현지, YYYY-MM-DD) */
  regularSeasonEnd: string | null;
  postSeasonStart: string | null;
  asOf: string;
}

async function getJson<T>(url: string): Promise<T> {
  // 페이지 ISR 과 같은 5분 — no-store 를 쓰면 ISR 라우트가 500 이 난다(isr-no-store-conflict)
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`statsapi ${res.status} ${url}`);
  return (await res.json()) as T;
}

const norm = (s: string) => s.toLowerCase().normalize("NFC").replace(/[^a-z0-9]/g, "");

async function load(season: number): Promise<MlbPostseasonPage | null> {
  const [standings, post, seasons] = await Promise.all([
    getJson<{ records: ApiStandingRecord[] }>(
      `${API}/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason&hydrate=team`,
    ),
    getJson<{ series?: ApiSeries[] }>(`${API}/schedule/postseason/series?season=${season}&sportId=1&hydrate=team`),
    getJson<{ seasons?: Array<{ regularSeasonEndDate?: string; postSeasonStartDate?: string }> }>(
      `${API}/seasons/${season}?sportId=1`,
    ).catch(() => ({ seasons: [] })),
  ]);
  if (!standings.records?.length) return null;

  // 우리 MLB 팀 — 이름 일치로 statsapi id 와 잇는다(로고·팀 페이지·Elo)
  const [ourTeams, matches] = await Promise.all([
    prisma.team.findMany({ where: { league: "MLB" }, select: { id: true, name: true, logoUrl: true } }),
    prisma.match.findMany({
      where: { league: "MLB", startTime: { gte: new Date(Date.UTC(season - 1, 2, 1)) } },
      select: {
        id: true, league: true, status: true, homeTeamId: true, awayTeamId: true,
        homeScore: true, awayScore: true, startTime: true, externalId: true,
      },
    }),
  ]);
  const ourByName = new Map(ourTeams.map((t) => [norm(t.name), t]));
  const apiTeams = standings.records.flatMap((r) => r.teamRecords.map((t) => t.team));
  const ourOf = new Map<number, (typeof ourTeams)[number]>();
  for (const t of apiTeams) {
    const hit = ourByName.get(norm(t.name));
    if (hit) ourOf.set(t.id, hit);
  }

  const elo = calcEloTable(matches);
  const koreaByTeam = new Map<number, string[]>();
  for (const p of BASEBALL_KOREA_PLAYERS) {
    if (p.level !== "MLB" || !p.team?.id) continue;
    koreaByTeam.set(p.team.id, [...(koreaByTeam.get(p.team.id) ?? []), p.nameKo]);
  }

  const nameOf = (t: ApiTeamRef) => toKoreanTeamName(t.name, "MLB") || t.teamName || t.name;
  const data = buildMlbPostseason(season, standings.records, post.series ?? [], {
    nameOf,
    eloOf: (id) => {
      const our = ourOf.get(id);
      return our ? getElo(elo, our.id) : null;
    },
    koreaOf: (id) => koreaByTeam.get(id) ?? [],
  });

  const logoById: Record<number, string> = {};
  const teamPageById: Record<number, number> = {};
  for (const [apiId, our] of ourOf) {
    if (our.logoUrl) logoById[apiId] = our.logoUrl;
    teamPageById[apiId] = our.id;
  }

  // 경기 상세 링크 — 우리 DB 에 수집된 포스트시즌 경기를 (홈팀·원정팀·한국 날짜)로 찾는다
  const kstDay = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  const matchByKey = new Map<string, string>();
  for (const m of matches) matchByKey.set(`${m.homeTeamId}-${m.awayTeamId}-${kstDay(m.startTime)}`, m.externalId);
  const gameHrefByPk: Record<number, string> = {};
  for (const s of data.series) {
    for (const g of s.games) {
      const home = g.homeId != null ? ourOf.get(g.homeId) : undefined;
      const awayApi = g.homeId === s.top.id ? s.bottom.id : s.top.id;
      const away = awayApi != null ? ourOf.get(awayApi) : undefined;
      if (!home || !away) continue;
      const ext = matchByKey.get(`${home.id}-${away.id}-${kstDay(new Date(g.date))}`);
      if (ext) gameHrefByPk[g.pk] = matchLiveHref("MLB", ext);
    }
  }

  const sz = seasons.seasons?.[0];
  return {
    data,
    logoById,
    teamPageById,
    gameHrefByPk,
    regularSeasonEnd: sz?.regularSeasonEndDate ?? null,
    postSeasonStart: sz?.postSeasonStartDate ?? null,
    asOf: new Date().toISOString(),
  };
}

/** 시즌 기준 — 2월 이전은 지난 시즌(포스트시즌 결과를 겨울에도 보여준다) */
export function currentMlbSeason(now = new Date()): number {
  return now.getUTCMonth() >= 1 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

export const getMlbPostseason = unstable_cache(
  async (season: number) => {
    try {
      return await load(season);
    } catch (e) {
      console.warn("[mlb-postseason] 조회 실패:", (e as Error).message);
      return null;
    }
  },
  ["mlb-postseason-v2"],
  { revalidate: 300 },
);
