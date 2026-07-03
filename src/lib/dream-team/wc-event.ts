// 드림팀 월드컵 이벤트 — 실경기(월드컵) 데이터 연동: 활약 선수 폼 보너스 + 판타지 포인트.
// 8월 빅5 개막 시 이 모듈의 매치 소스만 리그 경기로 교체해 상시 판타지로 전환하는 전제.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { getWorldCupPlayerStats } from "@/lib/sports/thesports/world-cup-player-stats";
import { getDreamPlayers } from "./pool";

// 결승(2026-07-19 KST) 다음 날까지 활성. 종료 후 폼 보너스는 0, 판타지 페이지는 최종 순위 열람.
export const WC_EVENT_END_MS = Date.UTC(2026, 6, 20);

export function wcEventActive(): boolean {
  return Date.now() < WC_EVENT_END_MS;
}

/** 폼 보너스 — 월드컵 누적 활약(골·도움·평점)을 경기 시뮬 OVR 가산으로 환산. 풀 선수만. */
export interface WcForm {
  bonus: number; // OVR 가산 1~4
  goals: number;
  assists: number;
  avgRating: number;
  games: number;
}

export const getWcFormMap = unstable_cache(
  async (): Promise<Record<string, WcForm>> => {
    if (!wcEventActive()) return {};
    const stats = await getWorldCupPlayerStats();
    if (stats.length === 0) return {};
    // dream-pool 에 있는 선수만 (게임 풀 = 빅5 현역 — 같은 ts player id 공간)
    const poolIds = new Set(getDreamPlayers(stats.map((s) => s.id)).map((p) => p.id));
    const out: Record<string, WcForm> = {};
    for (const s of stats) {
      if (!poolIds.has(s.id) || s.games === 0) continue;
      // 골 1 = +1, 도움 2 = +1, 평점 7.4+ (120분+ 표본) = +1. 상한 +4 — 전력차를 뒤집지 않는 버프 폭.
      const bonus = Math.min(
        4,
        Math.round(s.goals + s.assists * 0.5 + (s.avgRating >= 7.4 && s.minutes >= 120 ? 1 : 0)),
      );
      if (bonus > 0) out[s.id] = { bonus, goals: s.goals, assists: s.assists, avgRating: s.avgRating, games: s.games };
    }
    return out;
  },
  ["dream-wc-form"],
  { revalidate: 3 * 3600 },
);

export function wcPowerBonus(form: Record<string, WcForm> | null | undefined, playerId: string): number {
  return form?.[playerId]?.bonus ?? 0;
}

/** 판타지 포인트 — 종료 매치의 playerStats 를 경기 단위로 채점해 선수별 누적.
 *  출전 1 · 60분+ 1 · 골 4 · 도움 3 · 평점 8+ 2/7.5+ 1 · 옐로 −1 · 레드 −3 · GK 세이브 3개당 1. */
export interface FantasyLine {
  points: number;
  games: number;
  goals: number;
  assists: number;
}

interface TsPlayerStatRow {
  player_id: string;
  goals?: number;
  assists?: number;
  rating?: number;
  minutes_played?: number;
  yellow_cards?: number;
  red_cards?: number;
  yellow2red_cards?: number;
  saves?: number;
}

export const getWcFantasyMap = unstable_cache(
  async (): Promise<Record<string, FantasyLine>> => {
    // FINISHED 만 — 라이브 중 스탯 변동으로 포인트가 출렁이지 않게 확정 경기만 채점
    const matches = await prisma.match.findMany({
      where: { league: "WORLD_CUP", status: "FINISHED" },
      select: { id: true },
    });
    if (matches.length === 0) return {};
    const caches = await prisma.theSportsMatchCache.findMany({
      where: { matchId: { in: matches.map((m) => m.id) } },
      select: { playerStats: true },
    });
    const out: Record<string, FantasyLine> = {};
    for (const c of caches) {
      const stats = c.playerStats as TsPlayerStatRow[] | null;
      if (!Array.isArray(stats)) continue;
      for (const s of stats) {
        if (!s.player_id) continue;
        const min = s.minutes_played ?? 0;
        if (min <= 0) continue;
        const rating = Number(s.rating) || 0;
        const red = (s.red_cards ?? 0) + (s.yellow2red_cards ?? 0);
        const pts =
          1 +
          (min >= 60 ? 1 : 0) +
          (s.goals ?? 0) * 4 +
          (s.assists ?? 0) * 3 +
          (rating >= 8 ? 2 : rating >= 7.5 ? 1 : 0) -
          (s.yellow_cards ?? 0) -
          red * 3 +
          Math.floor((s.saves ?? 0) / 3);
        const cur = out[s.player_id] ?? { points: 0, games: 0, goals: 0, assists: 0 };
        cur.points += pts;
        cur.games += 1;
        cur.goals += s.goals ?? 0;
        cur.assists += s.assists ?? 0;
        out[s.player_id] = cur;
      }
    }
    return out;
  },
  ["dream-wc-fantasy"],
  { revalidate: 1800 },
);

/** 선발 라인업의 판타지 합산 — 랭킹·내 팀 상세 공용. */
export function lineupFantasyPoints(
  fantasy: Record<string, FantasyLine>,
  playerIds: string[],
): number {
  return playerIds.reduce((sum, id) => sum + (fantasy[id]?.points ?? 0), 0);
}
