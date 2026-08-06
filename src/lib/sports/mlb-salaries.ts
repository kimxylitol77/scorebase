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

  return enrichMlbSalaries(out);
}

// 연봉 rows(이름+금액)에 MLB Stats(공식·무료) 팀·사진 보강. seed 생성도 동일 함수 공유.
// meta/검색 실패해도 연봉은 유지. rows 는 in-place 변경 후 그대로 반환.
export async function enrichMlbSalaries(out: NormalizedSalary[]): Promise<NormalizedSalary[]> {
  const meta = await fetchMlbPlayerMeta();
  if (meta.size) {
    for (const r of out) {
      const m = meta.get(norm(r.playerName));
      if (!m) continue;
      if (m.team) r.teamName = m.team;
      if (m.id) r.photoUrl = `https://midfield.mlbstatic.com/v1/people/${m.id}/spots/120`;
    }
  }
  // 미매칭(IL·방출 등 active 명단 밖 — Rendon·Burnes·Bryant) 보강 — people/search 배치.
  // ⚠️ 팀이 빈 선수도 대상이다. photoUrl 만 보면 1차에서 사진만 얻고 팀을 못 얻은 선수가
  //    빠진다(2026-08-06 실측: 빈 팀 153명 중 116명이 search 로 채워지는데 안 타고 있었다).
  const unmatched = out.filter((r) => !r.photoUrl || !r.teamName);
  // 20명 배치 — 40명 콤마 URL 이 timeout 나면 catch 로 40명이 통째로 조용히 사라진다.
  // 실패 시 10명 반쪽으로 1회 재시도해 배치 하나의 실패가 전멸이 되지 않게 한다.
  const searchChunk = async (
    chunk: NormalizedSalary[],
    queryName: (r: NormalizedSalary) => string = (r) => r.playerName,
  ): Promise<void> => {
    const url = `https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(chunk.map(queryName).join(","))}&hydrate=currentTeam`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const data = (await res.json()) as { people?: Array<{ id: number; fullName: string; currentTeam?: { name?: string } }> };
    // 표기 변형을 양쪽에 적용 — 공식 fullName 이 더 긴 경우("Lance McCullers Jr.")와
    // spotrac 이 더 긴 경우("Josh H. Smith") 둘 다 있어서, 결과 쪽 키도 변형으로 펼쳐 둔다.
    const byNorm = new Map<string, NonNullable<typeof data.people>[number]>();
    for (const p of data.people ?? []) {
      for (const k of nameVariants(p.fullName)) {
        const prev = byNorm.get(k);
        // 동명이인(McCullers Jr/Sr)이 한 키로 충돌하면 현 소속 있는 쪽을 남긴다 —
        // Sr 는 은퇴자라 currentTeam 이 없거나 마이너다.
        if (!prev || (!prev.currentTeam?.name && p.currentTeam?.name)) byNorm.set(k, p);
      }
    }
    for (const r of chunk) {
      let p: NonNullable<typeof data.people>[number] | undefined;
      for (const k of nameVariants(r.playerName)) {
        p = byNorm.get(k);
        if (p) break;
      }
      if (!p) continue;
      if (p.currentTeam?.name && !r.teamName) r.teamName = p.currentTeam.name;
      if (!r.photoUrl) r.photoUrl = `https://midfield.mlbstatic.com/v1/people/${p.id}/spots/120`;
    }
  };
  const runBatches = async (
    rows: NormalizedSalary[],
    queryName?: (r: NormalizedSalary) => string,
  ): Promise<void> => {
    for (let i = 0; i < rows.length; i += 20) {
      const chunk = rows.slice(i, i + 20);
      try {
        await searchChunk(chunk, queryName);
      } catch {
        for (const half of [chunk.slice(0, 10), chunk.slice(10)]) {
          if (!half.length) continue;
          try {
            await searchChunk(half, queryName);
          } catch { /* 반쪽도 실패 — 이 묶음만 포기 */ }
        }
      }
    }
  };
  await runBatches(unmatched);
  // 2차 — 원본 표기로 못 찾은 선수를 변형 표기로 재검색. search 는 저장된 표기와 정확히
  // 맞아야 하는 게 아니라 표기 자체가 다르면 아예 안 나온다("T.J. Friedl" 0건, "TJ Friedl" 1건).
  const still = unmatched.filter((r) => !r.teamName || !r.photoUrl);
  if (still.length) {
    await runBatches(still, (r) => {
      const v = nameVariants(r.playerName);
      return v[v.length - 1] === norm(r.playerName) ? r.playerName : v[v.length - 1];
    });
  }
  return out;
}

/**
 * 검색 결과 대조용 이름 키 변형 — 원형 → Jr/Sr/III 제거 → 이니셜 점 제거 → 미들 이니셜 제거.
 * byNorm 의 키(공식 fullName)와 spotrac 표기 어느 쪽이 서픽스를 갖든 맞도록 양방향이 아니라
 * "관대한 후보 나열" 방식을 쓴다.
 */
function nameVariants(name: string): string[] {
  const base = norm(name);
  const noSuffix = norm(name.replace(/\s+(jr\.?|sr\.?|ii|iii|iv)$/i, ""));
  const noDots = base.replace(/\./g, "");
  const noMiddleInitial = norm(name.replace(/\s+[a-z]\.\s+/i, " "));
  return [...new Set([base, noSuffix, noDots, noMiddleInitial])];
}
