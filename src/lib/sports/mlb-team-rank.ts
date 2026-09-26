// MLB 팀별 지구 순위 — statsapi 공식 순위표(5분 캐시)를 우리 Team.id 로 잇는다. 팀 페이지 제목·설명용.
// KBO·NPB 는 thesports/baseball-table 이 같은 역할을 한다(ts 순위 캐시). MLB 는 ts 캐시가 없어
// 팀 페이지 제목에 순위가 빠진 채 30팀 모두 정적 제목으로 나갔다(2026-09-26 동종 페이지 비교).

const API = "https://statsapi.mlb.com/api/v1";

/** statsapi division id → 한글 라벨 (리그 약칭 + 지구) */
export const MLB_DIVISION_KO: Record<number, string> = {
  200: "AL 서부",
  201: "AL 동부",
  202: "AL 중부",
  203: "NL 서부",
  204: "NL 동부",
  205: "NL 중부",
};

export interface MlbTeamRank {
  /** 지구 순위 (1~5) */
  position: number;
  /** "NL 서부" 식 지구 라벨 */
  division: string;
  wins: number;
  losses: number;
}

interface ApiRecord {
  division?: { id?: number };
  teamRecords?: Array<{ team?: { name?: string }; divisionRank?: string; wins?: number; losses?: number }>;
}

const norm = (s: string) => s.toLowerCase().normalize("NFC").replace(/[^a-z0-9]/g, "");

/** 순수 함수 — statsapi records 에서 팀 이름(우리 DB Team.name)으로 지구 순위를 찾는다. 못 찾으면 null. */
export function mlbRankFromRecords(records: ApiRecord[], teamName: string): MlbTeamRank | null {
  const key = norm(teamName);
  for (const r of records) {
    const division = r.division?.id != null ? MLB_DIVISION_KO[r.division.id] : undefined;
    if (!division) continue;
    for (const t of r.teamRecords ?? []) {
      if (!t.team?.name || norm(t.team.name) !== key) continue;
      const position = Number(t.divisionRank);
      if (!Number.isFinite(position) || position < 1) return null;
      return { position, division, wins: t.wins ?? 0, losses: t.losses ?? 0 };
    }
  }
  return null;
}

/** 현재 시즌 MLB 지구 순위. 실패·미발견이면 null — 호출부는 정적 제목으로 폴백한다. */
export async function fetchMlbTeamRank(teamName: string, season = new Date().getUTCFullYear()): Promise<MlbTeamRank | null> {
  try {
    // 팀 페이지 ISR 과 같은 5분 — no-store 는 ISR 라우트를 500 으로 만든다(isr-no-store-conflict)
    const res = await fetch(
      `${API}/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason&hydrate=team`,
      { next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const d = (await res.json()) as { records?: ApiRecord[] };
    return mlbRankFromRecords(d.records ?? [], teamName);
  } catch {
    return null;
  }
}
