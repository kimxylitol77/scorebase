// PGA 투어 시즌 상금(머니리스트) — ESPN 골프 byathlete 통계 API 스크레이핑 (sort=general.amount).
// 소스: https://site.web.api.espn.com/apis/common/v3/sports/golf/pga/statistics/byathlete
//   ("amount" = Official money won, 2026-07-25 실측). 실패 시 fetch-salaries 의 seed fallback.
// teamName 필드에는 소속 팀이 없어 국가(영문, ESPN flag.alt)를 저장한다.

interface EspnByAthlete {
  requestedSeason?: { year?: number };
  categories?: { names: string[] }[];
  athletes?: {
    athlete: {
      displayName: string;
      headshot?: { href?: string };
      flag?: { alt?: string };
    };
    categories?: { values: (number | null)[] }[];
  }[];
}

export interface GolfSalaryRow {
  rank: number;
  playerName: string;
  teamName: string; // 국가 (영문)
  salary: number; // 시즌 상금 (USD)
  photoUrl?: string;
}

/** PGA 상금 시즌 라벨 — 시즌 = 역년. */
export function golfSeasonLabel(now: Date): string {
  return String(now.getUTCFullYear());
}

/** PGA 시즌 상금 top 60 — 실패·구조 변경 시 빈 배열 (호출측 seed fallback). */
export async function fetchGolfSalaries(now = new Date()): Promise<GolfSalaryRow[]> {
  const season = golfSeasonLabel(now);
  const url =
    `https://site.web.api.espn.com/apis/common/v3/sports/golf/pga/statistics/byathlete` +
    `?region=us&lang=en&season=${season}&limit=60&sort=general.amount%3Adesc`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const j = (await res.json()) as EspnByAthlete;
    const amountIdx = j.categories?.[0]?.names?.indexOf("amount") ?? -1;
    if (amountIdx < 0 || !j.athletes?.length) return [];
    const rows: GolfSalaryRow[] = [];
    // 동률 상금은 같은 순위 (기존 KBO withRanks 규칙과 동일)
    let lastSalary = -1;
    let lastRank = 0;
    for (const a of j.athletes) {
      const raw = a.categories?.[0]?.values?.[amountIdx];
      const salary = typeof raw === "number" ? Math.round(raw) : 0;
      if (salary <= 0) continue;
      if (salary !== lastSalary) {
        lastRank = rows.length + 1;
        lastSalary = salary;
      }
      rows.push({
        rank: lastRank,
        playerName: a.athlete.displayName,
        teamName: a.athlete.flag?.alt ?? "",
        salary,
        photoUrl: a.athlete.headshot?.href,
      });
    }
    return rows;
  } catch {
    return [];
  }
}
