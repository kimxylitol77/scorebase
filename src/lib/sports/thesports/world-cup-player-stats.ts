// 월드컵 본선 선수 스탯 실시간 집계 — 득점·도움·평점·카드 랭킹.
// 소스: TheSportsMatchCache.playerStats (Lightsail football-poller 가 라이브 중 ~2분 간격 push)
//       + cache.lineup (이름·사진·소속 side). TheSports API 직접 호출 없음 → Vercel 안전.
import { prisma } from "@/lib/db";
import rawOv from "../../../../data/player-overrides.json";

const OV = rawOv as Record<string, { nameKo?: string }>;

export interface WcPlayerStat {
  id: string; // ts player id
  name: string; // 한글 우선 (override → TheSportsPlayer.nameKo → lineup 영문)
  nameEn: string | null;
  country: string; // 소속 국가 영문 팀명 (표시 변환은 호출부에서)
  photo: string | null;
  hasMv: boolean; // PlayerMarketValue 보유 → /transfers 링크 가능
  goals: number;
  assists: number;
  yellow: number;
  red: number;
  avgRating: number; // rating>0 경기 평균 (소수 2)
  minutes: number;
  games: number; // 출전 경기 수 (minutes>0)
}

interface TsPlayerStatRow {
  player_id: string;
  goals?: number;
  assists?: number;
  yellow_cards?: number;
  red_cards?: number;
  yellow2red_cards?: number;
  rating?: number;
  minutes_played?: number;
}

interface TsLineupPlayer {
  id: string;
  name: string;
  logo?: string;
}

/** 본선 LIVE+FINISHED 매치의 playerStats 를 선수 단위로 누적 집계. */
export async function getWorldCupPlayerStats(): Promise<WcPlayerStat[]> {
  const matches = await prisma.match.findMany({
    where: { league: "WORLD_CUP", status: { in: ["LIVE", "FINISHED"] } },
    select: {
      id: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });
  if (matches.length === 0) return [];
  const matchById = new Map(matches.map((m) => [m.id, m]));

  const caches = await prisma.theSportsMatchCache.findMany({
    where: { matchId: { in: matches.map((m) => m.id) } },
    select: { matchId: true, playerStats: true, lineup: true },
  });

  interface Acc {
    name: string;
    photo: string | null;
    country: string;
    goals: number;
    assists: number;
    yellow: number;
    red: number;
    ratings: number[];
    minutes: number;
    games: number;
  }
  const acc = new Map<string, Acc>();

  for (const c of caches) {
    const stats = c.playerStats as TsPlayerStatRow[] | null;
    if (!Array.isArray(stats) || stats.length === 0) continue;
    const m = matchById.get(c.matchId);
    if (!m) continue;

    // lineup → 선수 id 별 이름·사진·소속 side(국가)
    const luRoot = c.lineup as { lineup?: { home?: TsLineupPlayer[]; away?: TsLineupPlayer[] } } | null;
    const lu = luRoot?.lineup ?? (luRoot as { home?: TsLineupPlayer[]; away?: TsLineupPlayer[] } | null);
    const meta = new Map<string, { name: string; logo: string | null; country: string }>();
    for (const [side, country] of [
      ["home", m.homeTeam.name],
      ["away", m.awayTeam.name],
    ] as const) {
      for (const pl of lu?.[side] ?? []) {
        meta.set(pl.id, { name: pl.name, logo: pl.logo || null, country });
      }
    }

    for (const s of stats) {
      if (!s.player_id) continue;
      const info = meta.get(s.player_id);
      const a = acc.get(s.player_id) ?? {
        name: info?.name ?? "",
        photo: info?.logo ?? null,
        country: info?.country ?? "",
        goals: 0,
        assists: 0,
        yellow: 0,
        red: 0,
        ratings: [],
        minutes: 0,
        games: 0,
      };
      if (!a.name && info?.name) a.name = info.name;
      if (!a.photo && info?.logo) a.photo = info.logo;
      if (!a.country && info?.country) a.country = info.country;
      a.goals += s.goals ?? 0;
      a.assists += s.assists ?? 0;
      a.yellow += s.yellow_cards ?? 0;
      a.red += (s.red_cards ?? 0) + (s.yellow2red_cards ?? 0);
      const rating = Number(s.rating) || 0;
      if (rating > 0) a.ratings.push(rating);
      const min = s.minutes_played ?? 0;
      a.minutes += min;
      if (min > 0) a.games += 1;
      acc.set(s.player_id, a);
    }
  }
  if (acc.size === 0) return [];

  // 한글명 + 시장가치 링크 가능 여부
  const ids = [...acc.keys()];
  const [tsRows, mvRows] = await Promise.all([
    prisma.theSportsPlayer.findMany({
      where: { id: { in: ids }, nameKo: { not: null } },
      select: { id: true, nameKo: true },
    }),
    prisma.playerMarketValue.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    }),
  ]);
  const koById = new Map(tsRows.map((r) => [r.id, r.nameKo!]));
  const mvIds = new Set(mvRows.map((r) => r.id));

  return [...acc.entries()].map(([id, a]) => ({
    id,
    name: OV[id]?.nameKo || koById.get(id) || a.name || "선수",
    nameEn: a.name || null,
    country: a.country,
    photo: a.photo,
    hasMv: mvIds.has(id),
    goals: a.goals,
    assists: a.assists,
    yellow: a.yellow,
    red: a.red,
    avgRating: a.ratings.length
      ? +(a.ratings.reduce((s, r) => s + r, 0) / a.ratings.length).toFixed(2)
      : 0,
    minutes: a.minutes,
    games: a.games,
  }));
}
