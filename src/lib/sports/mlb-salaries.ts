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
  teamName: string; // MLB Stats currentTeam(영문) 보강 — 표시 시 toKoreanTeamName
  salary: number; // USD (올시즌 cap total)
  photoUrl?: string; // MLB Stats headshot (이름 매칭분 ~93%)
}

/** MLB 시즌 라벨 — 단일 연도(3~10월 시즌). 비시즌도 당해 연도. */
export function mlbSeasonLabel(now: Date): string {
  return String(now.getUTCFullYear());
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// 이름 정규화 — 액센트 제거(López→lopez) + 소문자. spotrac↔MLB Stats 표기차 흡수.
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// MLB Stats API(무료 공식) — 선수 id(headshot) + roster 팀. spotrac 연봉에 팀·사진 보강.
// /sports/1/players 는 currentTeam 누락 多 → roster 30팀으로 팀 확정.
async function fetchMlbPlayerMeta(): Promise<Map<string, { id: number; team: string }>> {
  const year = new Date().getUTCFullYear();
  const meta = new Map<string, { id: number; team: string }>();
  try {
    const allRes = await fetch(`https://statsapi.mlb.com/api/v1/sports/1/players?season=${year}&hydrate=currentTeam`, { signal: AbortSignal.timeout(20000) });
    const all = (await allRes.json()) as { people?: Array<{ id: number; fullName: string; currentTeam?: { name?: string } }> };
    for (const p of all.people ?? []) meta.set(norm(p.fullName), { id: p.id, team: p.currentTeam?.name ?? "" });
    const tRes = await fetch(`https://statsapi.mlb.com/api/v1/teams?sportId=1&season=${year}`, { signal: AbortSignal.timeout(15000) });
    const teams = (await tRes.json()) as { teams?: Array<{ id: number; name: string }> };
    for (const t of teams.teams ?? []) {
      try {
        const rRes = await fetch(`https://statsapi.mlb.com/api/v1/teams/${t.id}/roster?season=${year}`, { signal: AbortSignal.timeout(10000) });
        const r = (await rRes.json()) as { roster?: Array<{ person?: { id: number; fullName: string } }> };
        for (const e of r.roster ?? []) {
          if (!e.person) continue;
          const k = norm(e.person.fullName);
          const m = meta.get(k);
          if (m) m.team = t.name; // roster 우선(현재 소속)
          else meta.set(k, { id: e.person.id, team: t.name });
        }
      } catch { /* skip team */ }
    }
  } catch { /* meta 없으면 빈 — 연봉만 유지 */ }
  return meta;
}

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

  // MLB Stats 매칭 — 팀·사진 보강 (meta 실패해도 연봉은 유지)
  const meta = await fetchMlbPlayerMeta();
  if (meta.size) {
    for (const r of out) {
      const m = meta.get(norm(r.playerName));
      if (!m) continue;
      if (m.team) r.teamName = m.team;
      if (m.id) r.photoUrl = `https://midfield.mlbstatic.com/v1/people/${m.id}/spots/120`;
    }
  }
  // 미매칭(IL·방출 등 active 명단 밖 — Rendon·Burnes·Bryant) 보강 — people/search 배치(40명씩)
  const unmatched = out.filter((r) => !r.photoUrl);
  for (let i = 0; i < unmatched.length; i += 40) {
    const chunk = unmatched.slice(i, i + 40);
    try {
      const url = `https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(chunk.map((r) => r.playerName).join(","))}&hydrate=currentTeam`;
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
      const data = (await res.json()) as { people?: Array<{ id: number; fullName: string; currentTeam?: { name?: string } }> };
      const byNorm = new Map((data.people ?? []).map((p) => [norm(p.fullName), p]));
      for (const r of chunk) {
        const p = byNorm.get(norm(r.playerName));
        if (!p) continue;
        if (p.currentTeam?.name) r.teamName = p.currentTeam.name;
        r.photoUrl = `https://midfield.mlbstatic.com/v1/people/${p.id}/spots/120`;
      }
    } catch { /* 배치 실패 시 skip */ }
  }
  return out;
}
