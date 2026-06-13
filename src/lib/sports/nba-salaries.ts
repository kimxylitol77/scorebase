// NBA 선수 연봉 스크래퍼 — basketball-reference.com/contracts/players.html.
// ESPN salaries 는 봇차단(HTTP 202)이라 폐기, br 채택: 단일 요청으로 530명 전체 + 향후 계약.
//
// ⚠️ HTML 스크래핑 → 구조 변경 시 깨질 수 있음. job 단에서 "파싱 0건이면 기존 유지" 가드 필수.
// ⚠️ Sports Reference 출처 표기 권장 — 페이지 footer 에 rel="nofollow" 링크 명시.

import * as cheerio from "cheerio";

// basketball-reference 팀 약어 → ESPN 풀네임(team-names.ts 한글 키와 일치).
// br 특유 약어(BRK·CHO·PHO)도 포함.
const BR_TEAM_FULL: Record<string, string> = {
  ATL: "Atlanta Hawks", BOS: "Boston Celtics", BRK: "Brooklyn Nets", CHO: "Charlotte Hornets",
  CHI: "Chicago Bulls", CLE: "Cleveland Cavaliers", DAL: "Dallas Mavericks", DEN: "Denver Nuggets",
  DET: "Detroit Pistons", GSW: "Golden State Warriors", HOU: "Houston Rockets", IND: "Indiana Pacers",
  LAC: "LA Clippers", LAL: "Los Angeles Lakers", MEM: "Memphis Grizzlies", MIA: "Miami Heat",
  MIL: "Milwaukee Bucks", MIN: "Minnesota Timberwolves", NOP: "New Orleans Pelicans", NYK: "New York Knicks",
  OKC: "Oklahoma City Thunder", ORL: "Orlando Magic", PHI: "Philadelphia 76ers", PHO: "Phoenix Suns",
  POR: "Portland Trail Blazers", SAC: "Sacramento Kings", SAS: "San Antonio Spurs", TOR: "Toronto Raptors",
  UTA: "Utah Jazz", WAS: "Washington Wizards",
};

export interface NormalizedSalary {
  rank: number;
  playerName: string;
  teamName: string; // ESPN 풀네임 (약어 변환) — 표시 시 toKoreanTeamName
  salary: number; // USD (올시즌)
}

/** NBA 시즌 라벨 — 10월~6월. */
export function currentSeasonLabel(now: Date): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const startYear = m >= 7 ? y : y - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function parseSalary(s: string): number | null {
  const n = parseInt(s.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** basketball-reference 계약 테이블 → 올시즌 연봉 랭킹. 단일 요청. */
export async function fetchNbaSalaries(): Promise<NormalizedSalary[]> {
  const url = "https://www.basketball-reference.com/contracts/players.html";
  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    html = await res.text();
  } catch {
    return [];
  }

  const $ = cheerio.load(html);
  const rows: NormalizedSalary[] = [];
  // 첫 시즌 컬럼(data-stat="y1") = 현재 시즌 연봉.
  $("#player-contracts tbody tr").not(".thead").each((_, tr) => {
    const name = $(tr).find('td[data-stat="player"]').text().trim();
    const abbr = $(tr).find('td[data-stat="team_id"]').text().trim();
    const y1 = $(tr).find('td[data-stat="y1"]').text().trim();
    const salary = parseSalary(y1);
    if (!name || salary == null) return; // 올시즌 연봉 없는 행(미래 계약만) skip
    rows.push({
      rank: 0, // 아래서 연봉 desc 로 재부여
      playerName: name,
      teamName: BR_TEAM_FULL[abbr] ?? abbr,
      salary,
    });
  });

  // 연봉 내림차순 정렬 후 rank 부여 (br Rk 는 빈 행 포함 순번이라 직접 매김).
  rows.sort((a, b) => b.salary - a.salary);
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}
