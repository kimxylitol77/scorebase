// 월드컵 본선 선수 스탯 실시간 집계 — 득점·도움·평점·카드 랭킹.
// 소스: TheSportsMatchCache.playerStats (Lightsail football-poller 가 라이브 중 ~2분 간격 push)
//       + cache.lineup (이름·사진·소속 side). TheSports API 직접 호출 없음 → Vercel 안전.
import { prisma } from "@/lib/db";
import { fifaCountryKo, fifaFlag } from "@/lib/sports/fifa-rankings";
import { toKoreanTeamName } from "@/lib/team-names";
import type { LeaderRow } from "@/components/LeagueLeaderBoard";
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
  saves: number; // GK 세이브 (필드 플레이어는 0)
  keyPasses: number; // 키패스 (찬스메이킹)
  defActions: number; // 수비 포인트 = 태클 + 인터셉트 + 클리어런스
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
  saves?: number;
  key_passes?: number;
  tackles?: number;
  interceptions?: number;
  clearances?: number;
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
    saves: number;
    keyPasses: number;
    defActions: number;
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
        saves: 0,
        keyPasses: 0,
        defActions: 0,
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
      a.saves += s.saves ?? 0;
      a.keyPasses += s.key_passes ?? 0;
      a.defActions += (s.tackles ?? 0) + (s.interceptions ?? 0) + (s.clearances ?? 0);
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
    saves: a.saves,
    keyPasses: a.keyPasses,
    defActions: a.defActions,
    avgRating: a.ratings.length
      ? +(a.ratings.reduce((s, r) => s + r, 0) / a.ratings.length).toFixed(2)
      : 0,
    minutes: a.minutes,
    games: a.games,
  }));
}

/** 집계 → LeagueLeaderBoard rowsByCategory (GOAL·ASSIST·RATING·SAVE·YELLOW·RED 각 TOP 10).
 *  predictions/WORLD_CUP 와 /world-cup 허브가 공유. 전 카테고리 빈 배열이면 null. */
export function buildWcLeaderRows(stats: WcPlayerStat[]): Record<string, LeaderRow[]> | null {
  if (stats.length === 0) return null;
  const countryKo = (en: string) => fifaCountryKo(en) ?? toKoreanTeamName(en, "WORLD_CUP") ?? en;
  const toRow = (s: WcPlayerStat, i: number, value: number, unit: string | null): LeaderRow => ({
    rank: i + 1,
    playerName: s.name,
    playerNameEn: s.nameEn,
    teamName: `${fifaFlag(s.country)} ${countryKo(s.country)}`.trim(),
    teamShort: null,
    value,
    unit,
    appearances: s.games,
    photoUrl: s.photo,
    externalId: s.hasMv ? s.id : null,
  });
  const top = (
    filter: (s: WcPlayerStat) => boolean,
    sort: (a: WcPlayerStat, b: WcPlayerStat) => number,
    value: (s: WcPlayerStat) => number,
    unit: string | null,
  ) => stats.filter(filter).sort(sort).slice(0, 10).map((s, i) => toRow(s, i, value(s), unit));
  const rows: Record<string, LeaderRow[]> = {
    GOAL: top((s) => s.goals > 0, (a, b) => b.goals - a.goals || b.avgRating - a.avgRating, (s) => s.goals, "골"),
    ASSIST: top((s) => s.assists > 0, (a, b) => b.assists - a.assists || b.avgRating - a.avgRating, (s) => s.assists, "도움"),
    // 키패스(찬스메이킹) — 도움으로 이어지지 않은 결정적 패스까지
    CHANCE: top((s) => s.keyPasses > 0, (a, b) => b.keyPasses - a.keyPasses || b.avgRating - a.avgRating, (s) => s.keyPasses, "회"),
    // 평점 — 누적 45분+ 출전 선수만 (교체 투입 노이즈 방지)
    RATING: top((s) => s.avgRating > 0 && s.minutes >= 45, (a, b) => b.avgRating - a.avgRating || b.minutes - a.minutes, (s) => s.avgRating, "평점"),
    // 수비 포인트 = 태클+인터셉트+클리어런스 합산
    DEFENSE: top((s) => s.defActions > 0, (a, b) => b.defActions - a.defActions || b.avgRating - a.avgRating, (s) => s.defActions, "회"),
    // 세이브 — GK 만 값이 쌓임 (필드 플레이어 0)
    SAVE: top((s) => s.saves > 0, (a, b) => b.saves - a.saves || b.avgRating - a.avgRating, (s) => s.saves, "세이브"),
    YELLOW: top((s) => s.yellow > 0, (a, b) => b.yellow - a.yellow || b.avgRating - a.avgRating, (s) => s.yellow, "장"),
    RED: top((s) => s.red > 0, (a, b) => b.red - a.red || b.avgRating - a.avgRating, (s) => s.red, "장"),
  };
  return Object.values(rows).every((r) => r.length === 0) ? null : rows;
}
