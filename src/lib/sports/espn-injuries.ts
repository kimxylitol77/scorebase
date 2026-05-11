// ESPN injuries JSON API — NBA/MLB/NHL 통합. 키 불필요.
// 응답: { injuries: [{ displayName(팀), injuries: [{ athlete, status, shortComment, date }] }] }

export interface EspnInjuryEntry {
  playerId: number;
  playerName: string;
  /** 한 줄 라벨 — UI 표시·심각도 매핑용 */
  reason: string;
  /** 원본 status — "Day-To-Day" | "Out" | "Injured Reserve" 등 */
  status: string;
  teamName: string;
  fixtureDate?: string;
}

const ENDPOINT: Record<string, string> = {
  NBA: "https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/injuries",
  MLB: "https://site.web.api.espn.com/apis/site/v2/sports/baseball/mlb/injuries",
  NHL: "https://site.web.api.espn.com/apis/site/v2/sports/hockey/nhl/injuries",
};

interface EspnRaw {
  injuries?: Array<{
    displayName?: string;
    injuries?: Array<{
      status?: string;
      shortComment?: string;
      longComment?: string;
      date?: string;
      athlete?: {
        id?: string | number;
        displayName?: string;
        shortName?: string;
        links?: Array<{ href?: string }>;
      };
    }>;
  }>;
}

type EspnAthlete = {
  id?: string | number;
  displayName?: string;
  shortName?: string;
  links?: Array<{ href?: string }>;
};

function extractAthleteId(athlete: EspnAthlete | undefined): number {
  // ESPN id 가 athlete.id 또는 links의 URL 끝 segment 에 있음
  if (athlete?.id) {
    const n = Number(athlete.id);
    if (Number.isFinite(n)) return n;
  }
  for (const l of athlete?.links ?? []) {
    const m = l.href?.match(/\/id\/(\d+)/);
    if (m) return Number(m[1]);
  }
  return 0;
}

export async function fetchEspnInjuries(
  league: "NBA" | "MLB" | "NHL",
): Promise<EspnInjuryEntry[]> {
  const url = ENDPOINT[league];
  if (!url) return [];
  const res = await fetch(url, {
    headers: { "user-agent": "scorebase/1.0" },
    next: { revalidate: 600 },
  });
  if (!res.ok) {
    console.warn(`[espn-injuries] ${league} fetch 실패: HTTP ${res.status}`);
    return [];
  }
  const raw = (await res.json()) as EspnRaw;
  const out: EspnInjuryEntry[] = [];
  for (const teamBlock of raw.injuries ?? []) {
    const teamName = teamBlock.displayName ?? "";
    for (const inj of teamBlock.injuries ?? []) {
      const athlete = inj.athlete;
      const name = athlete?.displayName ?? athlete?.shortName ?? "";
      if (!name) continue;
      out.push({
        playerId: extractAthleteId(athlete),
        playerName: name,
        // 우리 페이지 reason → 한글 매핑 함수가 'Day-To-Day' 같은 영문도 처리하도록
        reason: inj.status ?? inj.shortComment ?? "Injured",
        status: inj.status ?? "Injured",
        teamName,
        fixtureDate: inj.date,
      });
    }
  }
  return out;
}

/** 팀명으로 부상자 필터 (api-football getTeamInjuries 와 동일 시그니처) */
export function getTeamEspnInjuries(
  all: EspnInjuryEntry[],
  teamName: string,
  _beforeIso?: string,
  limit = 30,
): EspnInjuryEntry[] {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = norm(teamName);
  const filtered = all.filter((i) => {
    const t = norm(i.teamName);
    return t.includes(target) || target.includes(t);
  });
  return filtered.slice(0, limit);
}
