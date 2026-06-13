// MLB 선수 연봉 스크래퍼 — spotrac.com/mlb/rankings.
// basketball-reference 와 달리 baseball-reference 는 403, ESPN 은 202(봇차단) → spotrac 채택.
//
// ⚠️ spotrac 메인 랭킹은 .list-group-item div. NFL 추천 위젯(.widget-list)이 사이드바에
//    섞이므로 제외 필수 + 우리 MLB 선수 매칭(페이지단)으로 한 번 더 정제.
// ⚠️ HTML 스크래핑 → 구조 변경 시 깨질 수 있음. job 단 "파싱 0건이면 기존 유지" 가드 필수.

import * as cheerio from "cheerio";

export interface NormalizedSalary {
  rank: number;
  playerName: string;
  teamName: string; // spotrac 팀 표기(영문, 비어있을 수 있음) — 표시 시 toKoreanTeamName
  salary: number; // USD (올시즌 cap total)
}

/** MLB 시즌 라벨 — 단일 연도(3~10월 시즌). 비시즌도 당해 연도. */
export function mlbSeasonLabel(now: Date): string {
  return String(now.getUTCFullYear());
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export async function fetchMlbSalaries(): Promise<NormalizedSalary[]> {
  const year = new Date().getUTCFullYear();
  let html: string;
  try {
    const res = await fetch(
      `https://www.spotrac.com/mlb/rankings/player/_/year/${year}/sort/cap_total`,
      { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(20000) },
    );
    if (!res.ok) return [];
    html = await res.text();
  } catch {
    return [];
  }

  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const out: NormalizedSalary[] = [];

  $("a[href*='/redirect/player/']").each((_, a) => {
    const $a = $(a);
    const name = $a.text().trim();
    if (!name || name.length < 3 || /sign in|premium/i.test(name)) return;
    const $row = $a.closest(".list-group-item");
    if (!$row.length || $row.closest(".widget-list").length) return; // NFL 사이드바 위젯 제외
    if (seen.has(name)) return; // 선수 중복 링크 방지

    // 금액 — 행 내 첫 $숫자 (cap total)
    let salaryText = "";
    $row.find("*").each((_, e) => {
      if (salaryText) return;
      const t = $(e).clone().children().remove().end().text().trim();
      if (/^\$[0-9][0-9,]{4,}$/.test(t)) salaryText = t;
    });
    if (!salaryText) return;
    const salary = parseInt(salaryText.replace(/[$,]/g, ""), 10);
    if (!Number.isFinite(salary) || salary < 1) return;

    // 팀 — 행 내 MLB 팀 링크(선수 링크 제외). 없으면 빈 문자열(페이지단 보강).
    let team = "";
    $row.find("a[href*='/mlb/']").each((_, e) => {
      if (team) return;
      const href = $(e).attr("href") ?? "";
      if (/player|redirect/.test(href)) return;
      const t = $(e).text().trim();
      if (t && t.length >= 2 && t.length <= 30) team = t;
    });

    seen.add(name);
    out.push({ rank: 0, playerName: name, teamName: team, salary });
  });

  // cap total desc 정렬 후 rank 부여 (spotrac 이 이미 정렬돼 있지만 안전하게)
  out.sort((a, b) => b.salary - a.salary);
  out.forEach((r, i) => (r.rank = i + 1));
  return out;
}
