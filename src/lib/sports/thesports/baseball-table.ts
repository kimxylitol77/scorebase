// KBO/NPB 시즌 순위 — TheSports season/table/detail (공식 순위, position 직접 제공).
// 야구는 축구 standings-poller cover 안 함 → 여기서 직접 fetch + 1h 캐시.
// team_id 매칭: season/table/detail.team_id == baseball-team-id-mapping.tsId (2026-06-05 KBO 10/10·NPB 12/12 검증).
//
// ⚠️ season_id 는 시즌마다 변경 (TheSports). 매 시즌 초 season/list 에서 최신 year 의 id 로 갱신할 것.
//   조회: /v1/baseball/season/list?page=N → unique_tournament_id 가 아래 TOURNAMENT 값 + 최신 year.
//   (KBO unique_tournament=56ypq36s0o9qd7o, NPB=9k82re4svpxqepz)

import { unstable_cache } from "next/cache";
import rawMapping from "./baseball-team-id-mapping.json";

interface MapEntry {
  ourId: number;
  ourLeague: string;
  tsId: string;
}
const mapping = rawMapping as MapEntry[];

const BASE = "https://api.thesports.com";

// 시즌마다 갱신 (위 주석 참조). 2026 시즌.
const SEASON_ID: Record<string, string> = {
  KBO: "318q63s4v00qo9j",
  NPB: "pxwrxgsj10kmyk0",
};

export interface BaseballTableRow {
  position: number;
  ourTeamId: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number; // 득점 (runs scored)
  goalsAgainst: number; // 실점
}

interface RawRow {
  team_id: string;
  position: number;
  total: number;
  win: number;
  draw: number;
  loss: number;
  goals: number;
  goals_against: number;
}

async function fetchRaw(league: string): Promise<BaseballTableRow[]> {
  const sid = SEASON_ID[league];
  if (!sid) return [];
  const user = process.env.THESPORTS_USER ?? "";
  const secret = process.env.THESPORTS_SECRET ?? "";
  if (!user || !secret) return [];
  try {
    const r = await fetch(
      `${BASE}/v1/baseball/season/table/detail?user=${user}&secret=${secret}&uuid=${sid}`,
      { cache: "no-store" },
    );
    if (!r.ok) return [];
    const d = (await r.json()) as {
      results?: { tables?: Array<{ rows?: RawRow[] }> };
    };
    const tsIdToOur = new Map(
      mapping.filter((m) => m.ourLeague === league).map((m) => [m.tsId, m.ourId]),
    );
    const rows = (d.results?.tables ?? []).flatMap((t) => t.rows ?? []);
    return rows
      .map((row): BaseballTableRow | null => {
        const ourTeamId = tsIdToOur.get(row.team_id);
        if (ourTeamId == null) return null;
        return {
          position: row.position,
          ourTeamId,
          played: row.total,
          wins: row.win,
          draws: row.draw,
          losses: row.loss,
          goalsFor: row.goals,
          goalsAgainst: row.goals_against,
        };
      })
      .filter((r): r is BaseballTableRow => r != null)
      .sort((a, b) => a.position - b.position);
  } catch {
    return [];
  }
}

/**
 * KBO/NPB 시즌 순위 (TheSports 공식). 1시간 캐시.
 * 미지원 리그/실패 시 빈 배열 → 호출 측에서 calcStandings fallback.
 */
export function fetchBaseballTable(league: string): Promise<BaseballTableRow[]> {
  return unstable_cache(() => fetchRaw(league), ["baseball-table", league], {
    revalidate: 3600,
  })();
}
