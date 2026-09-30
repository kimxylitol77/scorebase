// 아시안게임 농구(남·녀) 순위표 — ts 순위 API 가 미인가라 경기 결과로 만든다. 조별 표 + 최종 순위(금·은·동·4위).
//  ts 경기엔 조 번호가 없고 단계(stage_id)만 있다. 조별리그 = 첫 단계, 그 경기들로 이어지는 팀 묶음이 곧 한 조다.
//  4강 = 경기가 2개인 마지막 단계, 결승 = 그 뒤 단판 중 4강 승자끼리, 3·4위전 = 4강 패자끼리.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { thesportsGet } from "@/lib/sports/thesports/client";

/** ts 시즌 id — match/diary 의 results_extra.competition 으로 찾았다(2026-10-01). */
export const AG_BK_TS_SEASON: Record<string, string> = {
  ASIAN_GAMES_BK: "gy0or5gteynqwzv",
  ASIAN_GAMES_BK_W: "kn54ql7txgnrvy9",
};

export interface StageMatch {
  stageId: string;
  startTime: number;
  homeId: number;
  awayId: number;
  homeScore: number | null;
  awayScore: number | null;
  finished: boolean;
}
export interface GroupRow { teamId: number; w: number; l: number; pf: number; pa: number; advanced: boolean }
export interface AgBkStandings {
  groups: GroupRow[][];
  /** 1~4위 팀 id (끝난 경기만으로 정해진 자리만, 없으면 null) */
  podium: Array<number | null>;
  knockoutTeams: number[];
}

const winnerOf = (m: StageMatch) =>
  m.finished && m.homeScore != null && m.awayScore != null && m.homeScore !== m.awayScore
    ? (m.homeScore > m.awayScore ? m.homeId : m.awayId)
    : null;
const loserOf = (m: StageMatch) => {
  const w = winnerOf(m);
  return w == null ? null : w === m.homeId ? m.awayId : m.homeId;
};

export function buildAgBkStandings(matches: StageMatch[]): AgBkStandings {
  const sorted = [...matches].sort((a, b) => a.startTime - b.startTime);
  if (sorted.length === 0) return { groups: [], podium: [null, null, null, null], knockoutTeams: [] };
  // 단계 순서 = 첫 경기 시각 순
  const stageOrder: string[] = [];
  for (const m of sorted) if (!stageOrder.includes(m.stageId)) stageOrder.push(m.stageId);
  const byStage = (id: string) => sorted.filter((m) => m.stageId === id);
  const groupMatches = byStage(stageOrder[0]);

  // 조 = 조별리그 경기로 이어진 팀 묶음(union-find)
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  for (const m of groupMatches) {
    for (const t of [m.homeId, m.awayId]) if (!parent.has(t)) parent.set(t, t);
    parent.set(find(m.homeId), find(m.awayId));
  }
  const knockoutTeams = new Set<number>();
  for (const id of stageOrder.slice(1)) for (const m of byStage(id)) { knockoutTeams.add(m.homeId); knockoutTeams.add(m.awayId); }

  const rows = new Map<number, GroupRow>();
  for (const t of parent.keys()) rows.set(t, { teamId: t, w: 0, l: 0, pf: 0, pa: 0, advanced: knockoutTeams.has(t) });
  for (const m of groupMatches) {
    const w = winnerOf(m);
    if (w == null) continue;
    const h = rows.get(m.homeId)!, a = rows.get(m.awayId)!;
    h.pf += m.homeScore!; h.pa += m.awayScore!; a.pf += m.awayScore!; a.pa += m.homeScore!;
    if (w === m.homeId) { h.w++; a.l++; } else { a.w++; h.l++; }
  }
  // 조 안 정렬: 승 → 맞대결 승자(2팀 동률일 때) → 득실차 → 득점
  const h2h = (x: number, y: number) => {
    const m = groupMatches.find((g) => (g.homeId === x && g.awayId === y) || (g.homeId === y && g.awayId === x));
    const w = m ? winnerOf(m) : null;
    return w === x ? -1 : w === y ? 1 : 0;
  };
  const groupMap = new Map<number, GroupRow[]>();
  for (const r of rows.values()) {
    const k = find(r.teamId);
    groupMap.set(k, [...(groupMap.get(k) ?? []), r]);
  }
  const firstPlayed = (g: GroupRow[]) => Math.min(...groupMatches.filter((m) => g.some((r) => r.teamId === m.homeId)).map((m) => m.startTime));
  const groups = [...groupMap.values()]
    .map((g) =>
      g.sort((x, y) => {
        if (y.w !== x.w) return y.w - x.w;
        const tied = g.filter((r) => r.w === x.w);
        if (tied.length === 2) { const d = h2h(x.teamId, y.teamId); if (d) return d; }
        return (y.pf - y.pa) - (x.pf - x.pa) || y.pf - x.pf;
      }),
    )
    .sort((a, b) => firstPlayed(a) - firstPlayed(b));

  // 최종 순위 — 4강(2경기인 마지막 단계) 뒤의 단판에서 결승·3·4위전을 가린다
  const podium: Array<number | null> = [null, null, null, null];
  const semiStage = [...stageOrder].reverse().find((id) => byStage(id).length === 2);
  if (semiStage) {
    const semis = byStage(semiStage);
    const semiWinners = new Set(semis.map(winnerOf).filter((x): x is number => x != null));
    const semiLosers = new Set(semis.map(loserOf).filter((x): x is number => x != null));
    const after = stageOrder.slice(stageOrder.indexOf(semiStage) + 1).flatMap(byStage);
    const final = after.find((m) => semiWinners.has(m.homeId) && semiWinners.has(m.awayId));
    const bronze = after.find((m) => semiLosers.has(m.homeId) && semiLosers.has(m.awayId));
    if (final) { podium[0] = winnerOf(final); podium[1] = loserOf(final); }
    if (bronze) { podium[2] = winnerOf(bronze); podium[3] = loserOf(bronze); }
  }
  return { groups, podium, knockoutTeams: [...knockoutTeams] };
}

/** ts 단계 + 우리 DB 경기(팀·점수) → 순위표. 1시간 캐시. 대회 밖 리그·ts 실패면 null. */
export const getAgBkStandings = unstable_cache(
  async (league: string): Promise<AgBkStandings | null> => {
    const season = AG_BK_TS_SEASON[league];
    if (!season) return null;
    const r = await thesportsGet<{ code: number; results?: Array<{ id: string; round?: { stage_id?: string } }> }>(
      "/v1/basketball/match/season/recent", { uuid: season },
    ).catch(() => null);
    const stageOf = new Map((r?.results ?? []).map((m) => [`ts-${m.id}`, m.round?.stage_id ?? ""]));
    if (stageOf.size === 0) return null;
    const ours = await prisma.match.findMany({
      where: { league, externalId: { in: [...stageOf.keys()] } },
      select: { externalId: true, startTime: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, status: true },
    });
    const matches: StageMatch[] = ours.flatMap((m) => {
      const stageId = stageOf.get(m.externalId);
      return stageId
        ? [{ stageId, startTime: m.startTime.getTime(), homeId: m.homeTeamId, awayId: m.awayTeamId, homeScore: m.homeScore, awayScore: m.awayScore, finished: m.status === "FINISHED" }]
        : [];
    });
    return matches.length ? buildAgBkStandings(matches) : null;
  },
  ["ag-bk-standings-v1"],
  { revalidate: 3600 },
);
