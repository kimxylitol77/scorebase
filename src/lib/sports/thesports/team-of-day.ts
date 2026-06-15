// 월드컵 '오늘의 베스트 XI' — 하루 완료 경기 출전 선수 평점 기반 4-2-3-1 베스트11.
// 소스: TheSportsMatchCache.lineup(평점·포지션·로고) + playerStats(골·도움). TheSports 직접
// 호출 없음 → Vercel 안전. world-cup-player-stats.ts 의 cache 집계 패턴 차용 + position/날짜 필터.
import { prisma } from "@/lib/db";
import { fifaCountryKo, fifaFlag } from "@/lib/sports/fifa-rankings";
import { toKoreanTeamName } from "@/lib/team-names";
import rawOv from "../../../../data/player-overrides.json";

const OV = rawOv as Record<string, { nameKo?: string }>;

/** '오늘의 베스트 XI' 분석 글의 slug 접두사. 뒤에 KST 날짜(YYYY-MM-DD)가 붙는다. */
export const TOD_ARTICLE_SLUG_PREFIX = "world-cup-team-of-day-";

interface TsLineupPlayer {
  id: string;
  name: string;
  logo?: string;
  rating?: string | number;
  position?: string;
  first?: number;
  captain?: number;
}
interface TsPlayerStatRow {
  player_id: string;
  goals?: number;
  assists?: number;
  minutes_played?: number;
}

export interface TodPlayer {
  id: string;
  name: string; // 한글 우선
  nameEn: string | null;
  pos: string; // G | D | M | F
  country: string; // 영문 팀명
  countryKo: string;
  flag: string;
  rating: number; // 그날 경기 평점 (0~10)
  goals: number;
  assists: number;
  logo: string | null;
  captain: boolean;
  hasMv: boolean; // 시장가치 보유 → /transfers 링크
  x: number; // 피치 좌표 %
  y: number;
  star: number; // 1~5
}
export interface TeamOfDay {
  date: string; // 표시 기준 KST YYYY-MM-DD
  matchCount: number;
  matches: {
    home: string;
    away: string;
    homeKo: string;
    awayKo: string;
    homeScore: number | null;
    awayScore: number | null;
  }[];
  xi: TodPlayer[];
  bench: TodPlayer[];
  topRating: number;
  complete: boolean; // xi 11명 채워졌는지
}

// 4-2-3-1 — build-world-cup-xi.ts 와 동일 좌표. M 5명 중 상위 3=AM(y32), 하위 2=DM(y52).
const POS_LAYOUT: Record<"G" | "D" | "M" | "F", { n: number; xs: number[]; ys: number[] }> = {
  G: { n: 1, xs: [50], ys: [90] },
  D: { n: 4, xs: [16, 39, 61, 84], ys: [70, 70, 70, 70] },
  M: { n: 5, xs: [22, 50, 78, 35, 65], ys: [32, 32, 32, 52, 52] },
  F: { n: 1, xs: [50], ys: [14] },
};

// KST 날짜(YYYY-MM-DD) → 그날 00:00~24:00(KST)에 해당하는 UTC startTime 범위.
function kstDayRangeUtc(dateKst: string): { gte: Date; lt: Date } {
  const startUtcMs = Date.parse(`${dateKst}T00:00:00Z`) - 9 * 3600000;
  return { gte: new Date(startUtcMs), lt: new Date(startUtcMs + 86400000) };
}

/** 가장 최근 완료 경기가 속한 KST 날짜 (기본 표시일). 완료 경기 없으면 null. */
export async function latestFinishedDateKst(): Promise<string | null> {
  const m = await prisma.match.findFirst({
    where: { league: "WORLD_CUP", status: "FINISHED" },
    orderBy: { startTime: "desc" },
    select: { startTime: true },
  });
  if (!m) return null;
  return new Date(m.startTime.getTime() + 9 * 3600000).toISOString().slice(0, 10);
}

const koCountry = (en: string) =>
  fifaCountryKo(en) ?? toKoreanTeamName(en, "WORLD_CUP") ?? en;

/**
 * 지정 KST 날짜(미지정 시 최근 완료일)의 월드컵 완료 경기 출전 선수에서
 * 평점 기반 4-2-3-1 베스트11 + 벤치 6명을 산출. 데이터 없으면 null.
 */
export async function getTeamOfDay(dateKst?: string): Promise<TeamOfDay | null> {
  const date = dateKst ?? (await latestFinishedDateKst());
  if (!date) return null;
  const { gte, lt } = kstDayRangeUtc(date);

  const matches = await prisma.match.findMany({
    where: { league: "WORLD_CUP", status: "FINISHED", startTime: { gte, lt } },
    select: {
      id: true,
      homeScore: true,
      awayScore: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      theSportsCache: { select: { lineup: true, playerStats: true } },
    },
    orderBy: { startTime: "asc" },
  });
  if (matches.length === 0) return null;

  interface Raw {
    id: string;
    name: string;
    pos: string;
    rating: number;
    logo: string | null;
    captain: boolean;
    country: string;
    goals: number;
    assists: number;
  }
  const byId = new Map<string, Raw>(); // id 중복(연장 등) 시 최고 rating 유지
  const matchMeta: TeamOfDay["matches"] = [];

  for (const m of matches) {
    matchMeta.push({
      home: m.homeTeam.name,
      away: m.awayTeam.name,
      homeKo: koCountry(m.homeTeam.name),
      awayKo: koCountry(m.awayTeam.name),
      homeScore: m.homeScore,
      awayScore: m.awayScore,
    });

    const luRoot = m.theSportsCache?.lineup as
      | { lineup?: { home?: TsLineupPlayer[]; away?: TsLineupPlayer[] }; home?: TsLineupPlayer[]; away?: TsLineupPlayer[] }
      | null;
    const lu = luRoot?.lineup ?? luRoot;
    const ps = m.theSportsCache?.playerStats as TsPlayerStatRow[] | null;
    const statById = new Map((Array.isArray(ps) ? ps : []).map((s) => [s.player_id, s]));

    for (const [side, country] of [
      ["home", m.homeTeam.name],
      ["away", m.awayTeam.name],
    ] as const) {
      for (const pl of lu?.[side] ?? []) {
        const rating = Number(pl.rating) || 0;
        if (rating <= 0) continue; // 미출전/평점없음 제외
        const pos = (pl.position ?? "").toUpperCase();
        if (pos !== "G" && pos !== "D" && pos !== "M" && pos !== "F") continue;
        const prev = byId.get(pl.id);
        if (prev && prev.rating >= rating) continue;
        const st = statById.get(pl.id);
        byId.set(pl.id, {
          id: pl.id,
          name: pl.name,
          pos,
          rating,
          logo: pl.logo || null,
          captain: pl.captain === 1,
          country,
          goals: st?.goals ?? 0,
          assists: st?.assists ?? 0,
        });
      }
    }
  }
  const uniq = [...byId.values()];
  if (uniq.length === 0) return null;

  // 한글명 + 시장가치 보유 여부
  const ids = uniq.map((p) => p.id);
  const [tsRows, mvRows] = await Promise.all([
    prisma.theSportsPlayer.findMany({
      where: { id: { in: ids }, nameKo: { not: null } },
      select: { id: true, nameKo: true },
    }),
    prisma.playerMarketValue.findMany({ where: { id: { in: ids } }, select: { id: true } }),
  ]);
  const koById = new Map(tsRows.map((r) => [r.id, r.nameKo!]));
  const mvIds = new Set(mvRows.map((r) => r.id));

  const sortScore = (a: Raw, b: Raw) =>
    b.rating - a.rating || b.goals - a.goals || b.assists - a.assists;

  const toTod = (p: Raw, x: number, y: number): TodPlayer => ({
    id: p.id,
    name: OV[p.id]?.nameKo || koById.get(p.id) || p.name,
    nameEn: p.name,
    pos: p.pos,
    country: p.country,
    countryKo: koCountry(p.country),
    flag: fifaFlag(p.country),
    rating: p.rating,
    goals: p.goals,
    assists: p.assists,
    logo: p.logo,
    captain: p.captain,
    hasMv: mvIds.has(p.id),
    x,
    y,
    star: Math.max(1, Math.min(5, Math.round(p.rating / 2))),
  });

  const xi: TodPlayer[] = [];
  const used = new Set<string>();
  (["G", "D", "M", "F"] as const).forEach((pos) => {
    const L = POS_LAYOUT[pos];
    uniq
      .filter((p) => p.pos === pos)
      .sort(sortScore)
      .slice(0, L.n)
      .forEach((p, i) => {
        xi.push(toTod(p, L.xs[i], L.ys[i]));
        used.add(p.id);
      });
  });
  const bench = uniq
    .filter((p) => !used.has(p.id))
    .sort(sortScore)
    .slice(0, 6)
    .map((p) => toTod(p, 0, 0));
  const topRating = xi.length ? Math.max(...xi.map((p) => p.rating)) : 0;

  return {
    date,
    matchCount: matches.length,
    matches: matchMeta,
    xi,
    bench,
    topRating,
    complete: xi.length === 11,
  };
}
