// 부상자 명단(원천에 선수 페이지 id 가 없는 MLB·NHL·KBO)의 선수 이름을 선수 페이지 id 로 잇는다.
//  · MLB: ESPN 부상자 → MLB Stats API 시즌 선수 목록(올해+작년, 장기 IL 은 올해 목록에 없음)
//         → 그래도 없으면 people/search. 동명이인은 소속팀으로 가린다. 실측 284명 중 268+search.
//  · NHL: ESPN 부상자 → NHL 검색 API(search.d3.nhle.com). 로스터 endpoint 는 프리시즌·LTIR 을
//         빠뜨려(실측 67명 중 45명) 쓰지 않는다. 팀 약어는 ESPN(LA·NJ·SJ·TB) ≠ NHL(LAK·NJD·SJS·TBL)
//         이라 접두 비교.
//  · KBO: KBO 공식 부상자(id 없음) → data/baseball-rosters.json(팀별 정적 로스터) 이름 매칭.
//         로스터 밖(육성·군보류 등, 실측 131명 중 7명)이나 같은 팀 동명이인(3명)은 KBO 공식
//         선수 검색(Player/Search.aspx)으로 팀·포지션까지 맞을 때만 잇는다.
//  이름만으로 억지 매칭하지 않는다 — 정규화 이름이 정확히 같고 팀이 맞을 때만 잇는다.
import { unstable_cache } from "next/cache";
import rawBaseballRosters from "../../../data/baseball-rosters.json";

const DAY = 86400;

/** 악센트·구두점·Jr/III 제거 소문자 키 (nba-players.ts normKey 와 같은 정책) */
export function normPlayerKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ───────── MLB ─────────
type MlbCand = { id: number; teamId: number | null };

const fetchMlbSeasonPlayers = unstable_cache(
  async (season: number): Promise<Array<{ id: number; name: string; teamId: number | null }>> => {
    const r = await fetch(
      `https://statsapi.mlb.com/api/v1/sports/1/players?season=${season}&fields=people,id,fullName,currentTeam,id`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!r.ok) return [];
    const d = (await r.json()) as { people?: Array<{ id: number; fullName: string; currentTeam?: { id: number } }> };
    return (d.people ?? []).map((p) => ({ id: p.id, name: p.fullName, teamId: p.currentTeam?.id ?? null }));
  },
  ["injury-ids-mlb-season-players"],
  { revalidate: DAY },
);

const fetchMlbTeamIds = unstable_cache(
  async (): Promise<Array<{ id: number; name: string }>> => {
    const r = await fetch("https://statsapi.mlb.com/api/v1/teams?sportId=1", { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return [];
    const d = (await r.json()) as { teams?: Array<{ id: number; name: string }> };
    return d.teams ?? [];
  },
  ["injury-ids-mlb-teams"],
  { revalidate: DAY },
);

/** 시즌 목록에 없는 선수(60일 IL·방출) — people/search. 이름당 7일 캐시. 정확히 한 명일 때만. */
const searchMlbPlayerId = unstable_cache(
  async (name: string): Promise<number | null> => {
    try {
      const r = await fetch(
        `https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(name)}&sportIds=1&fields=people,id,fullName`,
        { signal: AbortSignal.timeout(10000) },
      );
      if (!r.ok) return null;
      const d = (await r.json()) as { people?: Array<{ id: number; fullName: string }> };
      const key = normPlayerKey(name);
      const exact = (d.people ?? []).filter((p) => normPlayerKey(p.fullName) === key);
      return exact.length === 1 ? exact[0].id : null;
    } catch {
      return null;
    }
  },
  ["injury-ids-mlb-search"],
  { revalidate: 7 * DAY },
);

/** [{name, teamName(DB Team.name = MLB 공식 팀명)}] → Map<"name|team", mlbStatsId> */
export async function resolveMlbPlayerIds(
  entries: Array<{ name: string; teamName: string }>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (entries.length === 0) return out;
  const season = new Date().getUTCFullYear();
  const [cur, prev, teams] = await Promise.all([
    fetchMlbSeasonPlayers(season).catch(() => []),
    fetchMlbSeasonPlayers(season - 1).catch(() => []),
    fetchMlbTeamIds().catch(() => []),
  ]);
  const teamIdByName = new Map(teams.map((t) => [t.name.toLowerCase(), t.id]));
  const byKey = new Map<string, MlbCand[]>();
  // 올해 목록이 우선 — 작년 목록의 같은 선수는 currentTeam 이 옛 팀일 수 있다.
  for (const p of [...cur, ...prev]) {
    const k = normPlayerKey(p.name);
    const arr = byKey.get(k) ?? [];
    if (!arr.some((c) => c.id === p.id)) arr.push({ id: p.id, teamId: p.teamId });
    byKey.set(k, arr);
  }
  const pending: Array<{ key: string; name: string }> = [];
  for (const e of entries) {
    const k = normPlayerKey(e.name);
    const mapKey = `${k}|${e.teamName.toLowerCase()}`;
    if (out.has(mapKey)) continue;
    const cands = byKey.get(k) ?? [];
    if (cands.length === 1) {
      out.set(mapKey, cands[0].id);
      continue;
    }
    if (cands.length > 1) {
      const tid = teamIdByName.get(e.teamName.toLowerCase());
      const hit = tid != null ? cands.find((c) => c.teamId === tid) : undefined;
      if (hit) out.set(mapKey, hit.id);
      continue; // 동명이인인데 팀도 못 가리면 잇지 않는다
    }
    pending.push({ key: mapKey, name: e.name });
  }
  // 목록 밖 선수 검색 — 10개씩 병렬 (statsapi 는 관대하지만 한꺼번에 수십 건은 피한다)
  for (let i = 0; i < pending.length; i += 10) {
    const chunk = pending.slice(i, i + 10);
    const ids = await Promise.all(chunk.map((p) => searchMlbPlayerId(p.name)));
    chunk.forEach((p, j) => {
      if (ids[j] != null) out.set(p.key, ids[j] as number);
    });
  }
  return out;
}

// ───────── NHL ─────────
/** NHL 검색 API — 이름당 7일 캐시. 정규화 이름이 정확히 같은 선수만 반환.
 *  active=true 필터를 걸면 프로스펙트(이긴라·오쿨리아르 등 실측 5명)가 빠진다 — 은퇴 동명이인은
 *  호출부가 팀 약어로 가린다. */
const searchNhlPlayers = unstable_cache(
  async (name: string): Promise<Array<{ id: number; teamAbbrev: string }>> => {
    try {
      const r = await fetch(
        `https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=20&q=${encodeURIComponent(name)}`,
        { signal: AbortSignal.timeout(10000) },
      );
      if (!r.ok) return [];
      const d = (await r.json()) as Array<{ playerId?: string; name?: string; teamAbbrev?: string | null }>;
      const key = normPlayerKey(name);
      return d
        .filter((p) => p.playerId && p.name && normPlayerKey(p.name) === key)
        .map((p) => ({ id: Number(p.playerId), teamAbbrev: p.teamAbbrev ?? "" }));
    } catch {
      return [];
    }
  },
  ["injury-ids-nhl-search-v2"],
  { revalidate: 7 * DAY },
);

/** ESPN 약어(LA·NJ·SJ·TB)와 NHL 약어(LAK·NJD·SJS·TBL) 는 접두 관계 */
function nhlAbbrMatch(espnAbbr: string | null | undefined, nhlAbbr: string): boolean {
  if (!espnAbbr || !nhlAbbr) return false;
  const a = espnAbbr.toUpperCase();
  const b = nhlAbbr.toUpperCase();
  return a === b || b.startsWith(a) || a.startsWith(b);
}

/** [{name, teamAbbr(DB Team.shortName)}] → Map<"name|abbr", nhlPlayerId> */
export async function resolveNhlPlayerIds(
  entries: Array<{ name: string; teamAbbr: string | null }>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const uniq = [...new Map(entries.map((e) => [`${normPlayerKey(e.name)}|${e.teamAbbr ?? ""}`, e])).entries()];
  for (let i = 0; i < uniq.length; i += 10) {
    const chunk = uniq.slice(i, i + 10);
    const results = await Promise.all(chunk.map(([, e]) => searchNhlPlayers(e.name)));
    chunk.forEach(([key, e], j) => {
      const cands = results[j];
      const pick = cands.length === 1 ? cands[0] : cands.find((c) => nhlAbbrMatch(e.teamAbbr, c.teamAbbrev));
      if (pick) out.set(key, pick.id);
    });
  }
  return out;
}

// ───────── KBO ─────────
const BASEBALL_ROSTERS = rawBaseballRosters as Record<string, Array<{ id: string; name: string }>>;

/** DB Team.id + 선수명(한글) → KBO 공식 선수 id. 같은 팀 동명이인·미등재는 null. */
export function resolveKboPlayerId(teamId: number, name: string): string | null {
  const hits = (BASEBALL_ROSTERS[String(teamId)] ?? []).filter((p) => p.name === name);
  return hits.length === 1 ? hits[0].id : null;
}

/** KBO 공식 선수 검색 — 이름당 7일 캐시. 표 열: 등번호·선수명(playerId 링크)·팀명(약어)·포지션. */
const searchKboPlayers = unstable_cache(
  async (name: string): Promise<Array<{ id: string; team: string; position: string }>> => {
    try {
      const r = await fetch(
        `https://www.koreabaseball.com/Player/Search.aspx?searchWord=${encodeURIComponent(name)}`,
        { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(12000) },
      );
      if (!r.ok) return [];
      const html = await r.text();
      const out: Array<{ id: string; team: string; position: string }> = [];
      const rowRe = /<tr>\s*<td>[^<]*<\/td>\s*<td><a href='[^']*playerId=(\d+)'>([^<]*)<\/a><\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>/g;
      for (const m of html.matchAll(rowRe)) {
        if (m[2].trim() === name) out.push({ id: m[1], team: m[3].trim(), position: m[4].trim() });
      }
      return out;
    } catch {
      return [];
    }
  },
  ["injury-ids-kbo-search"],
  { revalidate: 7 * DAY },
);

/** 정적 로스터에서 못 가린 선수 — 검색 결과를 팀 약어(DB 팀명 접두: "KIA"→"KIA 타이거즈")와
 *  포지션(부상 명단의 "투수"·"외야수" 등)으로 좁혀 정확히 한 명일 때만. */
export async function searchKboPlayerId(name: string, teamName: string, position: string | null): Promise<string | null> {
  const rows = await searchKboPlayers(name);
  const byTeam = rows.filter((r) => r.team && teamName.toUpperCase().startsWith(r.team.toUpperCase()));
  if (byTeam.length === 1) return byTeam[0].id;
  if (byTeam.length > 1 && position) {
    const byPos = byTeam.filter((r) => r.position === position);
    if (byPos.length === 1) return byPos[0].id;
  }
  return null;
}
